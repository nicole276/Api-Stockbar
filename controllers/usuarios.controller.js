// controllers/usuarios.controller.js
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

// GET /api/usuarios - Listar usuarios
exports.getUsuarios = async (req, res) => {
  try {
    const { search, estado, id_rol } = req.query;
    let query = `
      SELECT u.*, r.nombre_rol
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      WHERE 1=1
    `;
    const params = []; 
    let n = 1;
    
    if (search) {
      query += ` AND (u.nombre_completo ILIKE $${n} OR u.email ILIKE $${n} OR u.usuario ILIKE $${n} OR u.document_number ILIKE $${n})`;
      params.push(`%${search}%`); 
      n++;
    }
    if (estado !== undefined) { 
      query += ` AND u.estado=$${n}`; 
      params.push(parseInt(estado)); 
      n++; 
    }
    if (id_rol) { 
      query += ` AND u.id_rol=$${n}`; 
      params.push(parseInt(id_rol)); 
      n++; 
    }
    query += ' ORDER BY u.id_usuario DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error listando usuarios' });
  }
};

// GET /api/usuarios/:id - Obtener un usuario
exports.getUsuarioById = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.*, r.nombre_rol FROM usuarios u LEFT JOIN roles r ON u.id_rol=r.id_rol WHERE u.id_usuario=$1',
      [req.params.id]
    );
    if (result.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error obteniendo usuario' });
  }
};

// POST /api/usuarios - Crear usuario
exports.createUsuario = async (req, res) => {
  try {
    const { id_rol, nombre_completo, email, usuario, contrasena, document_type = 'CC', document_number } = req.body;
    
    if (!id_rol || !nombre_completo || !email || !usuario || !contrasena || !document_number) {
      return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }
    
    // Validar unicidad
    const emailEx = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(email)=LOWER($1)', [email]);
    if (emailEx.rows.length > 0) 
      return res.status(400).json({ success: false, message: 'El email ya está registrado' });
    
    const userEx = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(usuario)=LOWER($1)', [usuario]);
    if (userEx.rows.length > 0) 
      return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso' });
    
    const docEx = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE document_type=$1 AND document_number=$2', 
      [document_type, document_number]
    );
    if (docEx.rows.length > 0) 
      return res.status(400).json({ success: false, message: 'El número de documento ya está registrado' });
    
    // Hash de contraseña
    const hash = await bcrypt.hash(contrasena, 10);
    
    const result = await pool.query(
      `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contrasena, estado, document_type, document_number)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7) RETURNING *`,
      [id_rol, nombre_completo, email, usuario, hash, document_type, document_number]
    );
    
    res.status(201).json({
      success: true,
      message: 'Usuario creado. Esperando activación del administrador.',
      data: result.rows[0]
    });
  } catch (e) {
    console.error('Error creando usuario:', e.message);
    const msg = e.message?.includes('duplicate') || e.message?.includes('unique') 
      ? 'El email o usuario ya está registrado' 
      : 'Error al crear el usuario';
    res.status(500).json({ success: false, message: msg });
  }
};

// PUT /api/usuarios/:id - Actualizar usuario
exports.updateUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_rol, nombre_completo, email, usuario, contrasena, document_type, document_number } = req.body;
    
    const updates = []; 
    const params = []; 
    let n = 1;
    
    if (id_rol !== undefined) { updates.push(`id_rol=$${n}`); params.push(id_rol); n++; }
    if (nombre_completo !== undefined) { updates.push(`nombre_completo=$${n}`); params.push(nombre_completo); n++; }
    if (email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) 
        return res.status(400).json({ success: false, message: 'Email inválido' });
      updates.push(`email=$${n}`); params.push(email); n++;
    }
    if (usuario !== undefined) { updates.push(`usuario=$${n}`); params.push(usuario); n++; }
    if (document_type !== undefined) { updates.push(`document_type=$${n}`); params.push(document_type); n++; }
    if (document_number !== undefined) { updates.push(`document_number=$${n}`); params.push(document_number); n++; }
    if (contrasena) {
      const hash = await bcrypt.hash(contrasena, 10);
      updates.push(`contrasena=$${n}`); params.push(hash); n++;
    }
    
    if (updates.length === 0) 
      return res.status(400).json({ success: false, message: 'Nada que actualizar' });
    
    params.push(id);
    const result = await pool.query(
      `UPDATE usuarios SET ${updates.join(',')} WHERE id_usuario=$${n} RETURNING *`,
      params
    );
    
    if (result.rowCount === 0) 
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    
    res.json({ success: true, message: 'Usuario actualizado exitosamente', data: result.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error actualizando usuario' });
  }
};

// PATCH /api/usuarios/:id/estado - Activar/Desactivar
exports.changeUsuarioStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (parseInt(id) === 1) 
      return res.status(400).json({ success: false, message: 'No se puede desactivar al administrador principal' });
    
    const result = await pool.query(
      'UPDATE usuarios SET estado=$1 WHERE id_usuario=$2 RETURNING *', 
      [estado, id]
    );
    if (result.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    
    res.json({ 
      success: true, 
      message: `Usuario ${estado == 1 ? 'activado' : 'desactivado'}`, 
      data: result.rows[0] 
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error cambiando estado de usuario' });
  }
};

// DELETE /api/usuarios/:id - Eliminar usuario
exports.deleteUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (parseInt(id) === 1) 
      return res.status(400).json({ success: false, message: 'No se puede eliminar al administrador principal' });
    if (parseInt(id) === req.user.id_usuario) 
      return res.status(400).json({ success: false, message: 'No puedes eliminarte a ti mismo' });
    
    const result = await pool.query(
      'DELETE FROM usuarios WHERE id_usuario=$1 RETURNING *', 
      [id]
    );
    if (result.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    
    res.json({ success: true, message: 'Usuario eliminado exitosamente' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error eliminando usuario' });
  }
};