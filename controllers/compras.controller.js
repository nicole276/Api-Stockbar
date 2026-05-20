// controllers/compras.controller.js
const pool = require('../config/database');

// GET /api/compras - Listar compras con proveedor
exports.getCompras = async (req, res) => {
  try {
    const { search, estado, id_proveedor } = req.query;
    let query = `
      SELECT c.*, p.nombre_razon_social as nombre_proveedor
      FROM compras c LEFT JOIN proveedores p ON c.id_proveedor=p.id_proveedor WHERE 1=1`;
    
    const params = []; 
    let n = 1;
    if (search) { query += ` AND p.nombre_razon_social ILIKE $${n}`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND c.estado=$${n}`; params.push(parseInt(estado)); n++; }
    if (id_proveedor) { query += ` AND c.id_proveedor=$${n}`; params.push(parseInt(id_proveedor)); n++; }
    query += ' ORDER BY c.id_compra DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error listando compras';
    res.status(500).json({ success: false, message: msg });
  }
};

// GET /api/compras/:id - Obtener compra con detalles
exports.getCompraById = async (req, res) => {
  try {
    const compra = await pool.query(`
      SELECT c.*, p.nombre_razon_social, p.telefono as proveedor_telefono
      FROM compras c LEFT JOIN proveedores p ON c.id_proveedor=p.id_proveedor WHERE c.id_compra=$1
    `, [req.params.id]);
    
    if (compra.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    
    const detalles = await pool.query(`
      SELECT dc.*, pr.nombre as nombre_producto,
             (dc.cantidad * dc.unidades_por_paquete) as unidades_ingresadas
      FROM detalle_compras dc LEFT JOIN productos pr ON dc.id_producto=pr.id_producto
      WHERE dc.id_compra=$1
    `, [req.params.id]);
    
    res.json({ success: true, data: { ...compra.rows[0], detalles: detalles.rows } });
  } catch (e) {
    console.error('ERROR GET /api/compras/:id →', e.message);
    res.status(500).json({ success: false, message: 'Error obteniendo compra' });
  }
};

// POST /api/compras - Registrar compra (✅ FIX: unidades_por_paquete)
exports.createCompra = async (req, res) => {
  try {
    const { id_proveedor, numero_factura, productos } = req.body;
    if (!id_proveedor || !numero_factura || !productos || productos.length === 0) {
      return res.status(400).json({ success: false, message: 'Proveedor, factura y productos son requeridos' });
    }

    const total = productos.reduce((s, p) => s + (p.precio * p.cantidad), 0);

    const compraResult = await pool.query(
      'INSERT INTO compras (id_proveedor, numero_factura, fecha, total, estado) VALUES ($1, $2, NOW(), $3, 1) RETURNING *',
      [id_proveedor, numero_factura, total]
    );
    const compra = compraResult.rows[0];

    for (const p of productos) {
      const unidadesPorPaquete = parseInt(p.unidades_por_paquete) || 1;
      const unidadesTotales    = p.cantidad * unidadesPorPaquete; // ✅ Multiplicación correcta

      await pool.query(
        'INSERT INTO detalle_compras (id_compra, id_producto, cantidad, precio, subtotal, unidades_por_paquete) VALUES ($1,$2,$3,$4,$5,$6)',
        [compra.id_compra, p.id_producto, p.cantidad, p.precio, (p.cantidad * p.precio), unidadesPorPaquete]
      );

      await pool.query(
        'UPDATE productos SET stock=stock+$1, precio_compra=$2 WHERE id_producto=$3',
        [unidadesTotales, p.precio, p.id_producto]
      );
    }

    res.status(201).json({ success: true, message: 'Compra registrada exitosamente', data: compra });
  } catch (e) {
    console.error('Error creando compra:', e.message);
    const msg = e.message?.includes('foreign key') ? 'Uno de los productos no existe en el inventario' : 'Error al registrar la compra';
    res.status(500).json({ success: false, message: msg });
  }
};

// PATCH /api/compras/:id/estado - Anular/Reactivar compra (✅ FIX: reversa stock correcto)
exports.changeEstadoCompra = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const compra = await pool.query('SELECT * FROM compras WHERE id_compra=$1', [id]);
    if (compra.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Compra no encontrada' });

    const estadoActual = compra.rows[0].estado;

    if (estadoActual === 2 || estadoActual === '2') {
      return res.status(400).json({ success: false, message: 'Una compra completada no se puede modificar' });
    }
    if (estadoActual === 0 || estadoActual === '0') {
      return res.status(400).json({ success: false, message: 'Una compra anulada no se puede modificar' });
    }

    if (estado === 0 || estado === '0') {
      const detalles = await pool.query('SELECT * FROM detalle_compras WHERE id_compra=$1', [id]);
      for (const d of detalles.rows) {
        const upp             = parseInt(d.unidades_por_paquete) || 1;
        const unidadesTotales = d.cantidad * upp; // ✅ Resta exactamente lo que se sumó
        await pool.query(
          'UPDATE productos SET stock=stock-$1 WHERE id_producto=$2',
          [unidadesTotales, d.id_producto]
        );
      }
    }

    await pool.query('UPDATE compras SET estado=$1 WHERE id_compra=$2', [estado, id]);
    res.json({ success: true, message: `Compra ${estado == 1 ? 'activada' : 'anulada'} exitosamente` });
  } catch (e) {
    console.error('Error actualizando estado compra:', e);
    res.status(500).json({ success: false, message: 'Error actualizando estado' });
  }
};

// DELETE /api/compras/:id - Bloqueado (usa anular en su lugar)
exports.deleteCompra = async (req, res) => {
  res.status(405).json({ success: false, message: 'Las compras no se pueden eliminar. Usa la opción de anular.' });
};