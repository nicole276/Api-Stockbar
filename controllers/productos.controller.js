// controllers/productos.controller.js
const pool = require('../config/database');

// GET /api/productos - Listar productos con estado de stock
exports.getProductos = async (req, res) => {
  try {
    const { search, estado, id_categoria } = req.query;
    let query = `
      SELECT p.*, c.nombre as nombre_categoria,
      CASE WHEN p.stock = 0 THEN 'Agotado'
           WHEN p.stock <= p.stock_minimo THEN 'Bajo stock'
           ELSE 'Suficiente' END as estado_stock
      FROM productos p LEFT JOIN categorias c ON p.id_categoria=c.id_categoria WHERE 1=1`;
    
    const params = []; 
    let n = 1;
    
    if (search) { query += ` AND (p.nombre ILIKE $${n})`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND p.estado=$${n}`; params.push(parseInt(estado)); n++; }
    if (id_categoria) { query += ` AND p.id_categoria=$${n}`; params.push(parseInt(id_categoria)); n++; }
    query += ' ORDER BY p.id_producto DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error listando productos'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// GET /api/productos/:id - Obtener un producto
exports.getProductoById = async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT p.*, c.nombre as nombre_categoria FROM productos p LEFT JOIN categorias c ON p.id_categoria=c.id_categoria WHERE p.id_producto=$1',
      [req.params.id]
    );
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error obteniendo producto'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// POST /api/productos - Crear producto (con unidades_por_paquete ✅)
exports.createProducto = async (req, res) => {
  try {
    const { nombre, id_categoria, precio_compra, precio_venta, stock = 0, stock_minimo = 0, unidades_por_paquete = 1, estado = 1 } = req.body;
    
    if (!nombre || !id_categoria || !precio_compra || !precio_venta) {
      return res.status(400).json({ success: false, message: 'Nombre, categoría, precio compra y precio venta son requeridos' });
    }
    
    const r = await pool.query(
      'INSERT INTO productos (nombre,id_categoria,precio_compra,precio_venta,stock,stock_minimo,unidades_por_paquete,estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [nombre, id_categoria, precio_compra, precio_venta, stock, stock_minimo, unidades_por_paquete, estado]
    );
    res.status(201).json({ success: true, message: 'Producto creado', data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error creando producto'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// PUT /api/productos/:id - Actualizar producto
exports.updateProducto = async (req, res) => {
  try {
    const { nombre, id_categoria, precio_compra, precio_venta, stock, stock_minimo, unidades_por_paquete, estado } = req.body;
    const r = await pool.query(
      'UPDATE productos SET nombre=$1,id_categoria=$2,precio_compra=$3,precio_venta=$4,stock=$5,stock_minimo=$6,unidades_por_paquete=$7,estado=$8 WHERE id_producto=$9 RETURNING *',
      [nombre, id_categoria, precio_compra, precio_venta, stock, stock_minimo, unidades_por_paquete, estado, req.params.id]
    );
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, message: 'Producto actualizado', data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error actualizando producto'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// PATCH /api/productos/:id/estado - Cambiar estado
exports.changeEstadoProducto = async (req, res) => {
  try {
    const r = await pool.query('UPDATE productos SET estado=$1 WHERE id_producto=$2 RETURNING *', [req.body.estado, req.params.id]);
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, message: `Producto ${req.body.estado == 1 ? 'activado' : 'desactivado'}`, data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error cambiando estado'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// DELETE /api/productos/:id - Eliminar producto
exports.deleteProducto = async (req, res) => {
  try {
    const ventas = await pool.query('SELECT COUNT(*) as c FROM detalle_ventas WHERE id_producto=$1', [req.params.id]);
    if (parseInt(ventas.rows[0].c) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: tiene ventas asociadas. Desactívalo en su lugar.' });
    }
    const r = await pool.query('DELETE FROM productos WHERE id_producto=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, message: 'Producto eliminado' });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error eliminando producto'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};