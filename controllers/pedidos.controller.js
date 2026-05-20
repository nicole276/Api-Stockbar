// controllers/pedidos.controller.js
const pool = require('../config/database');

// GET /api/pedidos - Solo pendientes (estado = 2)
exports.getPedidos = async (req, res) => {
  try {
    const { search, id_cliente } = req.query;
    let query = `
      SELECT v.*, c.nombre as nombre_cliente 
      FROM ventas v LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      WHERE v.estado = 2`;
    
    const params = []; let n = 1;
    if (search) { query += ` AND c.nombre ILIKE $${n}`; params.push(`%${search}%`); n++; }
    if (id_cliente) { query += ` AND v.id_cliente = $${n}`; params.push(parseInt(id_cliente)); n++; }
    query += ' ORDER BY v.id_venta DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: 'Error listando pedidos' }); }
};

// GET /api/pedidos/:id
exports.getPedidoById = async (req, res) => {
  try {
    const pedido = await pool.query(`
      SELECT v.*, c.nombre as nombre_cliente 
      FROM ventas v LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      WHERE v.id_venta = $1 AND v.estado = 2`, [req.params.id]);
    if (pedido.rows.length === 0) return res.status(404).json({ success: false, message: 'Pedido no encontrado o ya completado' });
    
    const detalles = await pool.query(`
      SELECT dv.*, p.nombre as nombre_producto 
      FROM detalle_ventas dv LEFT JOIN productos p ON dv.id_producto = p.id_producto 
      WHERE dv.id_venta = $1`, [req.params.id]);
      
    res.json({ success: true, data: { ...pedido.rows[0], detalles: detalles.rows } });
  } catch (e) { res.status(500).json({ success: false, message: 'Error obteniendo pedido' }); }
};

// POST /api/pedidos - Crear en estado pendiente (2)
exports.createPedido = async (req, res) => {
  try {
    const { id_cliente, productos } = req.body;
    if (!id_cliente || !productos || productos.length === 0) 
      return res.status(400).json({ success: false, message: 'Cliente y productos son requeridos' });

    const total = productos.reduce((s, p) => s + (p.precio * p.cantidad), 0);
    
    // ✅ Se crea con estado 2 (Pendiente)
    const ventaResult = await pool.query(
      'INSERT INTO ventas (id_cliente, fecha, total, estado) VALUES ($1, NOW(), $2, 2) RETURNING *',
      [id_cliente, total]
    );
    const pedido = ventaResult.rows[0];

    for (const p of productos) {
      await pool.query(
        'INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) VALUES ($1,$2,$3,$4,$5)',
        [pedido.id_venta, p.id_producto, p.cantidad, p.precio, p.subtotal]
      );
      // 💡 Nota: El stock se descuenta al completar (estado 1) para no bloquear inventario en pendientes
    }

    res.status(201).json({ success: true, message: 'Pedido registrado en estado pendiente', data: pedido });
  } catch (e) { res.status(500).json({ success: false, message: 'Error creando pedido' }); }
};

// PUT /api/pedidos/:id - Editar solo si está pendiente
exports.updatePedido = async (req, res) => {
  try {
    const { id_cliente, productos } = req.body;
    // Verificar que siga pendiente
    const check = await pool.query('SELECT estado FROM ventas WHERE id_venta = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    if (check.rows[0].estado !== 2) return res.status(400).json({ success: false, message: 'Solo se pueden editar pedidos pendientes' });

    if (id_cliente) await pool.query('UPDATE ventas SET id_cliente = $1 WHERE id_venta = $2', [id_cliente, req.params.id]);
    if (productos) {
      await pool.query('DELETE FROM detalle_ventas WHERE id_venta = $1', [req.params.id]);
      let total = 0;
      for (const p of productos) {
        const subtotal = p.precio * p.cantidad;
        total += subtotal;
        await pool.query('INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) VALUES ($1,$2,$3,$4,$5)', 
          [req.params.id, p.id_producto, p.cantidad, p.precio, subtotal]);
      }
      await pool.query('UPDATE ventas SET total = $1 WHERE id_venta = $2', [total, req.params.id]);
    }
    res.json({ success: true, message: 'Pedido actualizado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Error actualizando pedido' }); }
};

// PATCH /api/pedidos/:id/estado - Completar (2 → 1) y descontar stock
exports.completePedido = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT estado FROM ventas WHERE id_venta = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    if (check.rows[0].estado !== 2) return res.status(400).json({ success: false, message: 'El pedido ya fue completado o anulado' });

    // Descontar stock al completar
    const detalles = await pool.query('SELECT id_producto, cantidad FROM detalle_ventas WHERE id_venta = $1', [id]);
    for (const d of detalles.rows) {
      await pool.query('UPDATE productos SET stock = stock - $1 WHERE id_producto = $2', [d.cantidad, d.id_producto]);
    }

    await pool.query('UPDATE ventas SET estado = 1 WHERE id_venta = $1', [id]);
    res.json({ success: true, message: 'Pedido completado. Ahora aparece en Ventas.' });
  } catch (e) { res.status(500).json({ success: false, message: 'Error completando pedido' }); }
};