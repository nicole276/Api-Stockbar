// controllers/dashboard.controller.js
const pool = require('../config/database');

// GET /api/dashboard/stats
exports.getStats = async (req, res) => {
  try {
    const [productos, clientes, proveedores, bajoStock, agotados, ventasMes, comprasMes] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM productos WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM clientes WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM proveedores WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM productos WHERE stock <= stock_minimo AND estado = 1 AND stock > 0"),
      pool.query("SELECT COUNT(*) as c FROM productos WHERE stock = 0 AND estado = 1"),
      pool.query("SELECT COALESCE(SUM(total),0) as t FROM ventas WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE) AND estado = 1"),
      pool.query("SELECT COALESCE(SUM(total),0) as t FROM compras WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE) AND estado IN (1,2)")
    ]);
    
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
        balanceMes: parseFloat(ventasMes.rows[0].t) - parseFloat(comprasMes.rows[0].t)
      }
    });
  } catch (e) {
    console.error('Error dashboard stats:', e);
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
        SELECT TRIM(TO_CHAR(fecha, 'Day')) as label,
               COALESCE(SUM(total), 0) as value
        FROM ventas
        WHERE fecha >= CURRENT_DATE - INTERVAL '7 days' AND estado = 1
        GROUP BY TRIM(TO_CHAR(fecha, 'Day')), EXTRACT(DOW FROM fecha)
        ORDER BY EXTRACT(DOW FROM fecha)
      `;
    } else if (periodo === 'mes') {
      query = `
        SELECT TO_CHAR(fecha, 'YYYY-MM-DD') as label,
               COALESCE(SUM(total), 0) as value
        FROM ventas
        WHERE fecha >= CURRENT_DATE - INTERVAL '30 days' AND estado = 1
        GROUP BY TO_CHAR(fecha, 'YYYY-MM-DD')
        ORDER BY label
      `;
    } else {
      query = `
        SELECT TRIM(TO_CHAR(fecha, 'Month')) as label,
               COALESCE(SUM(total), 0) as value
        FROM ventas
        WHERE fecha >= CURRENT_DATE - INTERVAL '1 year' AND estado = 1
        GROUP BY TRIM(TO_CHAR(fecha, 'Month')), EXTRACT(MONTH FROM fecha)
        ORDER BY EXTRACT(MONTH FROM fecha)
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
             SUM(dv.cantidad) as total_vendido,
             COUNT(DISTINCT v.id_venta) as veces_vendido
      FROM productos p
      JOIN detalle_ventas dv ON p.id_producto = dv.id_producto
      JOIN ventas v ON dv.id_venta = v.id_venta
      WHERE v.estado = 1 AND v.fecha >= CURRENT_DATE - INTERVAL '30 days'
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
    if (tipo === 'semanal') trunc = 'week';
    if (tipo === 'anual') trunc = 'year';
    
    const result = await pool.query(`
      SELECT DATE_TRUNC($1, fecha) as periodo,
             SUM(CASE WHEN tipo = 'venta' THEN total ELSE 0 END) as ingresos,
             SUM(CASE WHEN tipo = 'compra' THEN total ELSE 0 END) as egresos
      FROM (
        SELECT fecha, total, 'venta' as tipo FROM ventas WHERE estado = 1
        UNION ALL
        SELECT fecha, total, 'compra' as tipo FROM compras WHERE estado IN (1,2)
      ) t
      GROUP BY DATE_TRUNC($1, fecha)
      ORDER BY periodo DESC
      LIMIT 12
    `, [trunc]);
    
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('Error dashboard reporte financiero:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo reporte financiero' });
  }
};