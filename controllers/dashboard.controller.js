// controllers/dashboard.controller.js
const pool = require('../config/database');

// GET /api/dashboard/stats
exports.getStats = async (req, res) => {
  try {
    // ✅ Query mejorada: verifica mes actual correctamente
    const [productos, clientes, proveedores, bajoStock, agotados, ventasMes, comprasMes, ventasDebug] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM productos WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM clientes WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM proveedores WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM productos WHERE stock <= stock_minimo AND estado = 1 AND stock > 0"),
      pool.query("SELECT COUNT(*) as c FROM productos WHERE stock = 0 AND estado = 1"),
      
      // ✅ Ventas del mes actual - Versión corregida
      pool.query(`
        SELECT 
          COUNT(*) as cantidad,
          COALESCE(SUM(total), 0) as t,
          MIN(fecha) as primera_venta,
          MAX(fecha) as ultima_venta
        FROM ventas 
        WHERE estado = 1
          AND fecha >= DATE_TRUNC('month', CURRENT_DATE)
          AND fecha < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      `),
      
      // ✅ Compras del mes actual - Versión corregida
      pool.query(`
        SELECT 
          COUNT(*) as cantidad,
          COALESCE(SUM(total), 0) as t
        FROM compras 
        WHERE estado IN (1, 2)
          AND fecha >= DATE_TRUNC('month', CURRENT_DATE)
          AND fecha < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      `),
      
      // 🔍 DEBUG: Todas las ventas (sin filtro de mes)
      pool.query(`
        SELECT 
          COUNT(*) as total_ventas,
          COALESCE(SUM(total), 0) as total_general,
          MIN(fecha) as primera_venta,
          MAX(fecha) as ultima_venta,
          COUNT(CASE WHEN estado = 1 THEN 1 END) as completadas,
          COUNT(CASE WHEN estado = 2 THEN 1 END) as pendientes
        FROM ventas
      `)
    ]);
    
    console.log('📊 DEBUG Ventas:', ventasDebug.rows[0]);
    console.log('📊 DEBUG Ventas del mes:', ventasMes.rows[0]);
    
    res.json({
      success: true,
      data: {
        totalProductos: parseInt(productos.rows[0].c),
        totalClientes: parseInt(clientes.rows[0].c),
        totalProveedores: parseInt(proveedores.rows[0].c),
        productosBajoStock: parseInt(bajoStock.rows[0].c),
        productosAgotados: parseInt(agotados.rows[0].c),
        ventasMes: parseFloat(ventasMes.rows[0].t),
        comprasMes: parseFloat(comprasMes.rows[0].t),
        balanceMes: parseFloat(ventasMes.rows[0].t) - parseFloat(comprasMes.rows[0].t),
        // 🔍 Datos debug (para ver en consola)
        _debug: {
          totalVentas: ventasDebug.rows[0],
          ventasDelMes: ventasMes.rows[0]
        }
      }
    });
  } catch (e) {
    console.error('❌ Error dashboard stats:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo estadísticas' });
  }
};
// GET /api/dashboard/ventas-chart
exports.getVentasChart = async (req, res) => {
  try {
    const { periodo = 'semana' } = req.query;
    let query = '';
    
    if (periodo === 'semana') {
      query = `
        WITH dias_semana AS (
          SELECT 0 as dow, 'Dom' as nombre
          UNION ALL SELECT 1, 'Lun'
          UNION ALL SELECT 2, 'Mar'
          UNION ALL SELECT 3, 'Mie'
          UNION ALL SELECT 4, 'Jue'
          UNION ALL SELECT 5, 'Vie'
          UNION ALL SELECT 6, 'Sab'
        ),
        ventas_semana AS (
          SELECT EXTRACT(DOW FROM fecha) as dow,
                 COALESCE(SUM(total), 0) as value
          FROM ventas
          WHERE fecha >= CURRENT_DATE - INTERVAL '7 days' AND estado = 1
          GROUP BY EXTRACT(DOW FROM fecha)
        )
        SELECT d.nombre as label,
               COALESCE(v.value, 0) as value
        FROM dias_semana d
        LEFT JOIN ventas_semana v ON d.dow = v.dow
        ORDER BY d.dow
      `;
    } else if (periodo === 'mes') {
      query = `
        WITH fechas AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '29 days',
            CURRENT_DATE,
            '1 day'::interval
          )::date as fecha
        ),
        ventas_dia AS (
          SELECT fecha::date as fecha,
                 COALESCE(SUM(total), 0) as value
          FROM ventas
          WHERE fecha >= CURRENT_DATE - INTERVAL '30 days' AND estado = 1
          GROUP BY fecha::date
        )
        SELECT TO_CHAR(f.fecha, 'DD/MM') as label,
               COALESCE(v.value, 0) as value
        FROM fechas f
        LEFT JOIN ventas_dia v ON f.fecha = v.fecha
        ORDER BY f.fecha
      `;
    } else {
      query = `
        WITH meses AS (
          SELECT generate_series(
            DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
            DATE_TRUNC('month', CURRENT_DATE),
            '1 month'::interval
          )::date as fecha
        ),
        ventas_mes AS (
          SELECT DATE_TRUNC('month', fecha)::date as fecha,
                 COALESCE(SUM(total), 0) as value
          FROM ventas
          WHERE fecha >= CURRENT_DATE - INTERVAL '1 year' AND estado = 1
          GROUP BY DATE_TRUNC('month', fecha)
        )
        SELECT TO_CHAR(m.fecha, 'Mon') as label,
               COALESCE(v.value, 0) as value
        FROM meses m
        LEFT JOIN ventas_mes v ON DATE_TRUNC('month', m.fecha) = v.fecha
        ORDER BY m.fecha
      `;
    }
    
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('Error dashboard chart:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo gráfico' });
  }
};

// GET /api/dashboard/productos-populares
exports.getProductosPopulares = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id_producto, p.nombre, p.precio_venta,
             COALESCE(SUM(dv.cantidad), 0) as total_vendido,
             COUNT(DISTINCT v.id_venta) as veces_vendido
      FROM productos p
      LEFT JOIN detalle_ventas dv ON p.id_producto = dv.id_producto
      LEFT JOIN ventas v ON dv.id_venta = v.id_venta AND v.estado = 1 AND v.fecha >= CURRENT_DATE - INTERVAL '30 days'
      WHERE p.estado = 1
      GROUP BY p.id_producto, p.nombre, p.precio_venta
      ORDER BY total_vendido DESC
      LIMIT 10
    `);
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('Error dashboard productos populares:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo productos populares' });
  }
};

// GET /api/dashboard/reporte-financiero
exports.getReporteFinanciero = async (req, res) => {
  try {
    const { tipo = 'mensual' } = req.query;
    let trunc = 'month';
    let interval = '11 months';
    let format = 'Mon YYYY';
    
    if (tipo === 'semanal') {
      trunc = 'week';
      interval = '7 days';
      format = 'DD/MM';
    } else if (tipo === 'anual') {
      trunc = 'year';
      interval = '5 years';
      format = 'YYYY';
    }
    
    const query = `
      WITH periodos AS (
        SELECT generate_series(
          DATE_TRUNC($1, CURRENT_DATE) - ($2::interval),
          DATE_TRUNC($1, CURRENT_DATE),
          ('1 ' || $1)::interval
        )::date as fecha
      ),
      datos AS (
        SELECT DATE_TRUNC($1, fecha) as periodo,
               SUM(CASE WHEN tipo = 'venta' THEN total ELSE 0 END) as ingresos,
               SUM(CASE WHEN tipo = 'compra' THEN total ELSE 0 END) as egresos
        FROM (
          SELECT fecha, total, 'venta' as tipo FROM ventas WHERE estado = 1
          UNION ALL
          SELECT fecha, total, 'compra' as tipo FROM compras WHERE estado IN (1,2)
        ) t
        GROUP BY DATE_TRUNC($1, fecha)
      )
      SELECT TO_CHAR(p.fecha, $3) as periodo,
             COALESCE(d.ingresos, 0) as ingresos,
             COALESCE(d.egresos, 0) as egresos
      FROM periodos p
      LEFT JOIN datos d ON DATE_TRUNC($1, p.fecha) = d.periodo
      ORDER BY p.fecha
    `;
    
    const result = await pool.query(query, [trunc, interval, format]);
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('Error dashboard reporte financiero:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo reporte financiero' });
  }
};
