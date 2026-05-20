// controllers/ventas.controller.js
const pool = require('../config/database');

// GET /api/ventas - Solo completadas (estado = 1)
exports.getVentas = async (req, res) => {
  try {
    const { search, id_cliente } = req.query;
    let query = `SELECT v.*, c.nombre as nombre_cliente FROM ventas v LEFT JOIN clientes c ON v.id_cliente=c.id_cliente WHERE v.estado = 1`;
    const params = []; let n = 1;
    if (search) { query += ` AND c.nombre ILIKE $${n}`; params.push(`%${search}%`); n++; }
    if (id_cliente) { query += ` AND v.id_cliente = $${n}`; params.push(parseInt(id_cliente)); n++; }
    query += ' ORDER BY v.id_venta DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Error listando ventas' }); }
};

// GET /api/ventas/:id
exports.getVentaById = async (req, res) => {
  try {
    const venta = await pool.query(`SELECT v.*, c.nombre as nombre_cliente FROM ventas v LEFT JOIN clientes c ON v.id_cliente=c.id_cliente WHERE v.id_venta=$1 AND v.estado=1`, [req.params.id]);
    if (venta.rows.length === 0) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    const detalles = await pool.query(`SELECT dv.*, p.nombre as nombre_producto FROM detalle_ventas dv LEFT JOIN productos p ON dv.id_producto=p.id_producto WHERE dv.id_venta=$1`, [req.params.id]);
    res.json({ success: true, data: { ...venta.rows[0], detalles: detalles.rows } });
  } catch (e) { res.status(500).json({ success: false, message: 'Error obteniendo venta' }); }
};

// POST /api/ventas - Crear venta directa (ya completada, estado 1)
exports.createVentaDirecta = async (req, res) => {
  try {
    const { id_cliente, productos } = req.body;
    if (!id_cliente || !productos || productos.length === 0) return res.status(400).json({ success: false, message: 'Cliente y productos requeridos' });
    
    // Validar stock antes de crear
    for (const p of productos) {
      const stockR = await pool.query('SELECT stock, nombre FROM productos WHERE id_producto=$1', [p.id_producto]);
      if (stockR.rows.length === 0 || parseInt(stockR.rows[0].stock) < p.cantidad) {
        return res.status(400).json({ success: false, message: `Stock insuficiente para: ${stockR.rows[0]?.nombre || 'Producto'}` });
      }
    }

    const total = productos.reduce((s, p) => s + (p.precio * p.cantidad), 0);
    const ventaResult = await pool.query('INSERT INTO ventas (id_cliente, fecha, total, estado) VALUES ($1, NOW(), $2, 1) RETURNING *', [id_cliente, total]);
    const venta = ventaResult.rows[0];

    for (const p of productos) {
      await pool.query('INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) VALUES ($1,$2,$3,$4,$5)', [venta.id_venta, p.id_producto, p.cantidad, p.precio, p.subtotal]);
      await pool.query('UPDATE productos SET stock=stock-$1 WHERE id_producto=$2', [p.cantidad, p.id_producto]);
    }

    res.status(201).json({ success: true, message: 'Venta completada registrada', data: venta });
  } catch (e) { res.status(500).json({ success: false, message: 'Error creando venta' }); }
};