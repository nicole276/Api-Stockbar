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
    const { nombre, email, password, id_role, estado = 1 } = req.body;
    
    // Verificar si el rol existe y está activo
    const roleCheck = await pool.query(
      'SELECT estado FROM roles WHERE id_role = $1',
      [id_role]
    );
    
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El rol especificado no existe' 
      });
    }
    
    if (roleCheck.rows[0].estado === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se puede crear un usuario con un rol inactivo' 
      });
    }
    
    // Verificar si el email ya existe
    const emailCheck = await pool.query(
      'SELECT id_user FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El email ya está registrado' 
      });
    }
    
    // Hashear password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, id_role, estado) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id_user, nombre, email, id_role, estado`,
      [nombre, email, hashedPassword, id_role, estado]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Usuario creado exitosamente',
      data: result.rows[0] 
    });
  } catch (e) {
    console.error('Error creando usuario:', e);
    res.status(500).json({ success: false, message: 'Error creando usuario' });
  }
};

// PUT /api/usuarios/:id - Actualizar usuario
exports.updateUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, id_role, estado } = req.body;
    
    // Si se cambia el rol, verificar que el nuevo rol esté activo
    if (id_role) {
      const roleCheck = await pool.query(
        'SELECT estado FROM roles WHERE id_role = $1',
        [id_role]
      );
      
      if (roleCheck.rows.length > 0 && roleCheck.rows[0].estado === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede asignar un rol inactivo al usuario' 
        });
      }
    }
    
    // Si se activa el usuario, verificar que su rol esté activo
    if (estado === 1) {
      const userRole = await pool.query(
        'SELECT id_role FROM usuarios WHERE id_user = $1',
        [id]
      );
      
      if (userRole.rows.length > 0) {
        const roleId = id_role || userRole.rows[0].id_role;
        const roleCheck = await pool.query(
          'SELECT estado FROM roles WHERE id_role = $1',
          [roleId]
        );
        
        if (roleCheck.rows.length > 0 && roleCheck.rows[0].estado === 0) {
          return res.status(400).json({ 
            success: false, 
            message: 'No se puede activar el usuario porque su rol está inactivo' 
          });
        }
      }
    }
    
    const result = await pool.query(
      'UPDATE usuarios SET nombre = $1, email = $2, id_role = $3, estado = $4 WHERE id_user = $5 RETURNING *',
      [nombre, email, id_role, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    res.json({ success: true, message: 'Usuario actualizado', data: result.rows[0] });
  } catch (e) {
    console.error('Error actualizando usuario:', e);
    res.status(500).json({ success: false, message: 'Error actualizando usuario' });
  }
};

// PATCH /api/usuarios/:id/estado - Cambiar estado del usuario
exports.changeEstadoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    // Si se activa el usuario, verificar que su rol esté activo
    if (estado === 1) {
      const userRole = await pool.query(
        `SELECT u.id_role, r.estado as role_estado 
         FROM usuarios u 
         JOIN roles r ON u.id_role = r.id_role 
         WHERE u.id_user = $1`,
        [id]
      );
      
      if (userRole.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }
      
      if (userRole.rows[0].role_estado === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede activar el usuario porque su rol está inactivo' 
        });
      }
    }
    
    const result = await pool.query(
      'UPDATE usuarios SET estado = $1 WHERE id_user = $2 RETURNING *',
      [estado, id]
    );
    
    res.json({ 
      success: true, 
      message: `Usuario ${estado === 1 ? 'activado' : 'desactivado'}`,
      data: result.rows[0] 
    });
  } catch (e) {
    console.error('Error cambiando estado del usuario:', e);
    res.status(500).json({ success: false, message: 'Error cambiando estado del usuario' });
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
