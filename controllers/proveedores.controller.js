// controllers/proveedores.controller.js
const pool = require('../config/database');

// GET /api/proveedores
exports.getProveedores = async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM proveedores WHERE 1=1';
    const params = []; 
    let n = 1;
    if (search) { query += ` AND (nombre_razon_social ILIKE $${n} OR contacto ILIKE $${n} OR telefono ILIKE $${n} OR email ILIKE $${n})`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND estado=$${n}`; params.push(parseInt(estado)); n++; }
    query += ' ORDER BY id_proveedor DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error listando proveedores';
    res.status(500).json({ success: false, message: msg });
  }
};

// GET /api/proveedores/:id
exports.getProveedorById = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM proveedores WHERE id_proveedor=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error obteniendo proveedor';
    res.status(500).json({ success: false, message: msg });
  }
};

// POST /api/proveedores
exports.createProveedor = async (req, res) => {
  try {
    const { nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado = 1, tipo } = req.body;
    if (!nombre_razon_social || !telefono) return res.status(400).json({ success: false, message: 'Nombre y teléfono son requeridos' });
    const r = await pool.query(
      'INSERT INTO proveedores (nombre_razon_social,tipo_documento,documento,contacto,telefono,email,direccion,estado,tipo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, tipo]
    );
    res.status(201).json({ success: true, message: 'Proveedor creado', data: r.rows[0] });
  } catch (e) {
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error creando proveedor';
    res.status(500).json({ success: false, message: msg });
  }
};

// PUT /api/proveedores/:id
exports.updateProveedor = async (req, res) => {
  try {
    const { nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, tipo } = req.body;
    const r = await pool.query(
      'UPDATE proveedores SET nombre_razon_social=$1,tipo_documento=$2,documento=$3,contacto=$4,telefono=$5,email=$6,direccion=$7,estado=$8,tipo=$9 WHERE id_proveedor=$10 RETURNING *',
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, tipo, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, message: 'Proveedor actualizado', data: r.rows[0] });
  } catch (e) {
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error actualizando proveedor';
    res.status(500).json({ success: false, message: msg });
  }
};

// PATCH /api/proveedores/:id/estado
exports.changeEstadoProveedor = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    // ✅ Validación clave: no desactivar si tiene compras activas
    if (estado === 0 || estado === '0') {
      const compras = await pool.query('SELECT COUNT(*) as c FROM compras WHERE id_proveedor=$1 AND estado=1', [id]);
      if (parseInt(compras.rows[0].c) > 0) {
        return res.status(400).json({ success: false, message: 'No se puede desactivar: este proveedor tiene compras activas asociadas' });
      }
    }
    const r = await pool.query('UPDATE proveedores SET estado=$1 WHERE id_proveedor=$2 RETURNING *', [estado, id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, message: `Proveedor ${estado == 1 ? 'activado' : 'desactivado'} exitosamente`, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al cambiar estado del proveedor' });
  }
};

// DELETE /api/proveedores/:id
exports.deleteProveedor = async (req, res) => {
  try {
    const compras = await pool.query('SELECT COUNT(*) as c FROM compras WHERE id_proveedor=$1', [req.params.id]);
    if (parseInt(compras.rows[0].c) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: tiene compras asociadas' });
    }
    const r = await pool.query('DELETE FROM proveedores WHERE id_proveedor=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, message: 'Proveedor eliminado' });
  } catch (e) {
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error eliminando proveedor';
    res.status(500).json({ success: false, message: msg });
  }
};