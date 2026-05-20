// controllers/roles.controller.js
const pool = require('../config/database');

// GET /api/roles - Listar roles
exports.getRoles = async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM roles WHERE 1=1';
    const params = []; 
    let n = 1;
    
    if (search) { 
      query += ` AND (nombre_rol ILIKE $${n} OR descripcion ILIKE $${n})`; 
      params.push(`%${search}%`); 
      n++; 
    }
    if (estado !== undefined) { 
      query += ` AND estado=$${n}`; 
      params.push(parseInt(estado)); 
      n++; 
    }
    query += ' ORDER BY id_rol DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error listando roles' });
  }
};

// GET /api/roles/:id - Obtener un rol con sus permisos
exports.getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const rol = await pool.query('SELECT * FROM roles WHERE id_rol = $1', [id]);
    if (rol.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    
    const permisos = await pool.query(`
      SELECT p.id_permiso, p.nombre
      FROM permisos p
      JOIN ver_detalle_rol vdr ON p.id_permiso = vdr.id_permiso
      WHERE vdr.id_rol = $1
    `, [id]);
    
    res.json({ success: true, data: { ...rol.rows[0], permisos: permisos.rows } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error obteniendo rol' });
  }
};

// POST /api/roles - Crear rol
exports.createRole = async (req, res) => {
  try {
    const { nombre_rol, descripcion, estado = 1, permisos = [] } = req.body;
    if (!nombre_rol) 
      return res.status(400).json({ success: false, message: 'Nombre del rol requerido' });
    
    const existe = await pool.query(
      'SELECT id_rol FROM roles WHERE LOWER(nombre_rol) = LOWER($1)', 
      [nombre_rol]
    );
    if (existe.rows.length > 0) 
      return res.status(400).json({ success: false, message: 'El rol ya existe' });
    
    const result = await pool.query(
      'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES ($1, $2, $3) RETURNING *',
      [nombre_rol, descripcion, estado]
    );
    const newId = result.rows[0].id_rol;
    
    // Agregar permisos + dashboard por defecto (id 9)
    const permisosConDashboard = [...new Set([...permisos, 9])];
    for (const pid of permisosConDashboard) {
      await pool.query(
        'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)', 
        [newId, pid]
      );
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Rol creado exitosamente', 
      data: result.rows[0] 
    });
  } catch (e) {
    console.error('Error creando rol:', e.message);
    const msg = e.message?.includes('duplicate') 
      ? 'Ya existe un rol con ese nombre' 
      : 'Error al crear el rol';
    res.status(500).json({ success: false, message: msg });
  }
};

// PUT /api/roles/:id - Actualizar rol
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === 1) 
      return res.status(400).json({ success: false, message: 'No se puede modificar el rol administrador' });
    
    const { nombre_rol, descripcion, estado, permisos } = req.body;
    const result = await pool.query(
      'UPDATE roles SET nombre_rol=$1, descripcion=$2, estado=$3 WHERE id_rol=$4 RETURNING *',
      [nombre_rol, descripcion, estado, id]
    );
    if (result.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    
    if (permisos && permisos.length > 0) {
      await pool.query('DELETE FROM ver_detalle_rol WHERE id_rol = $1', [id]);
      const permisosConDashboard = [...new Set([...permisos, 9])];
      for (const pid of permisosConDashboard) {
        await pool.query(
          'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)', 
          [id, pid]
        );
      }
    }
    
    res.json({ success: true, message: 'Rol actualizado', data: result.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error actualizando rol' });
  }
};

// PATCH /api/roles/:id/estado - Activar/Desactivar rol
exports.changeRoleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (parseInt(id) === 1) 
      return res.status(400).json({ success: false, message: 'No se puede desactivar el rol administrador' });
    
    if (estado === 0 || estado === '0') {
      const usuarios = await pool.query(
        'SELECT COUNT(*) as c FROM usuarios WHERE id_rol=$1 AND estado=1', 
        [id]
      );
      if (parseInt(usuarios.rows[0].c) > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede desactivar: hay usuarios activos con este rol' 
        });
      }
    }
    
    const result = await pool.query(
      'UPDATE roles SET estado=$1 WHERE id_rol=$2 RETURNING *', 
      [estado, id]
    );
    if (result.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    
    res.json({ 
      success: true, 
      message: `Rol ${estado == 1 ? 'activado' : 'desactivado'} exitosamente`, 
      data: result.rows[0] 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error cambiando estado de rol' });
  }
};

// DELETE /api/roles/:id - Eliminar rol
exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === 1) 
      return res.status(400).json({ success: false, message: 'No se puede eliminar el rol administrador' });
    
    const usuarios = await pool.query(
      'SELECT COUNT(*) as c FROM usuarios WHERE id_rol=$1 AND estado=1', 
      [id]
    );
    if (parseInt(usuarios.rows[0].c) > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se puede eliminar: hay usuarios activos con este rol' 
      });
    }
    
    await pool.query('DELETE FROM ver_detalle_rol WHERE id_rol=$1', [id]);
    const result = await pool.query(
      'DELETE FROM roles WHERE id_rol=$1 RETURNING *', 
      [id]
    );
    if (result.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    
    res.json({ success: true, message: 'Rol eliminado exitosamente' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error eliminando rol' });
  }
};