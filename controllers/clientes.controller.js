// controllers/clientes.controller.js
const pool = require('../config/database');

// GET /api/clientes
exports.getClientes = async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM clientes WHERE 1=1';
    const params = [];
    let n = 1;
    
    if (search) { 
      query += ` AND (nombre ILIKE $${n} OR telefono ILIKE $${n} OR documento ILIKE $${n})`; 
      params.push(`%${search}%`); 
      n++; 
    }
    if (estado !== undefined) { 
      query += ` AND estado=$${n}`; 
      params.push(estado.toString()); 
      n++; 
    }
    query += ' ORDER BY id_cliente DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error listando clientes'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// GET /api/clientes/:id
exports.getClienteById = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM clientes WHERE id_cliente=$1', [req.params.id]);
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { 
    res.status(500).json({ success: false, message: 'Error obteniendo cliente' }); 
  }
};

// POST /api/clientes
exports.createCliente = async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion, estado = 1 } = req.body;
    if (!nombre || !telefono) 
      return res.status(400).json({ success: false, message: 'Nombre y teléfono son requeridos' });
    
    const r = await pool.query(
      'INSERT INTO clientes (nombre,tipo_documento,documento,telefono,direccion,estado) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [nombre, tipo_documento, documento, telefono, direccion, estado]
    );
    res.status(201).json({ success: true, message: 'Cliente creado', data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error creando cliente'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// PUT /api/clientes/:id
exports.updateCliente = async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion, estado } = req.body;
    const r = await pool.query(
      'UPDATE clientes SET nombre=$1,tipo_documento=$2,documento=$3,telefono=$4,direccion=$5,estado=$6 WHERE id_cliente=$7 RETURNING *',
      [nombre, tipo_documento, documento, telefono, direccion, estado, req.params.id]
    );
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, message: 'Cliente actualizado', data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error actualizando cliente'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// PATCH /api/clientes/:id/estado
exports.changeEstadoCliente = async (req, res) => {
  try {
    const { estado } = req.body;
    
    // Validación: No desactivar si tiene ventas activas
    if (estado === 0 || estado === '0') {
      const ventas = await pool.query(
        'SELECT COUNT(*) as c FROM ventas WHERE id_cliente=$1 AND estado=1', 
        [req.params.id]
      );
      if (parseInt(ventas.rows[0].c) > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede desactivar: tiene ventas activas asociadas' 
        });
      }
    }
    
    const r = await pool.query('UPDATE clientes SET estado=$1 WHERE id_cliente=$2 RETURNING *', [estado, req.params.id]);
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    
    res.json({ success: true, message: `Cliente ${estado == 1 ? 'activado' : 'desactivado'}`, data: r.rows[0] });
  } catch (e) { 
    res.status(500).json({ success: false, message: 'Error cambiando estado' }); 
  }
};

// DELETE /api/clientes/:id
exports.deleteCliente = async (req, res) => {
  try {
    // Validación: No eliminar si tiene ventas
    const ventas = await pool.query('SELECT COUNT(*) as c FROM ventas WHERE id_cliente=$1', [req.params.id]);
    if (parseInt(ventas.rows[0].c) > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se puede eliminar: tiene ventas asociadas' 
      });
    }
    
    const r = await pool.query('DELETE FROM clientes WHERE id_cliente=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error eliminando cliente'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};