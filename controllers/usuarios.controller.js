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
      query += ` AND (u.nombre_completo ILIKE $${n} OR u.email ILIKE $${n} OR u.usuario ILIKE $${n})`;
      params.push(`%${search}%`);
      n++;
    }
    
    if (estado !== undefined) {
      query += ` AND u.estado = $${n}`;
      params.push(parseInt(estado));
      n++;
    }
    
    if (id_rol) {
      query += ` AND u.id_rol = $${n}`;
      params.push(parseInt(id_rol));
      n++;
    }
    
    query += ' ORDER BY u.id_usuario DESC';
    
    const result = await pool.query(query, params);
    res.json({ 
      success: true, 
      count: result.rowCount, 
      data: result.rows.map(u => ({
        ...u,
        estado: u.estado === 1 ? 'activo' : 'inactivo'
      }))
    });
  } catch (e) {
    console.error('Error listando usuarios:', e);
    res.status(500).json({ success: false, message: 'Error listando usuarios' });
  }
};

// NUEVA FUNCIÓN: Obtener usuario por ID
exports.getUsuarioById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT u.*, r.nombre_rol 
       FROM usuarios u 
       LEFT JOIN roles r ON u.id_rol = r.id_rol 
       WHERE u.id_usuario = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    const user = result.rows[0];
    res.json({ 
      success: true, 
      data: { 
        ...user, 
        estado: user.estado === 1 ? 'activo' : 'inactivo' 
      } 
    });
  } catch (e) {
    console.error('Error obteniendo usuario:', e);
    res.status(500).json({ success: false, message: 'Error obteniendo usuario' });
  }
};

// POST /api/usuarios - Crear usuario
exports.createUsuario = async (req, res) => {
  try {
    const { nombre_completo, usuario, email, contrasena, id_rol, estado = 1 } = req.body;
    
    if (!nombre_completo || !usuario || !email || !contrasena || !id_rol) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son requeridos' 
      });
    }
    
    // VALIDACIÓN: Verificar si el rol existe y está activo
    const roleCheck = await pool.query(
      'SELECT estado FROM roles WHERE id_rol = $1',
      [id_rol]
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
    
    // Verificar si el email o usuario ya existe
    const check = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE LOWER(email) = LOWER($1) OR LOWER(usuario) = LOWER($2)',
      [email, usuario]
    );
    
    if (check.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El email o usuario ya está registrado' 
      });
    }
    
    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);
    
    const result = await pool.query(
      `INSERT INTO usuarios (nombre_completo, usuario, email, contrasena, id_rol, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id_usuario, nombre_completo, usuario, email, id_rol, estado`,
      [nombre_completo, usuario, email, hashedPassword, id_rol, estado]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Usuario creado exitosamente',
      data: { ...result.rows[0], estado: result.rows[0].estado === 1 ? 'activo' : 'inactivo' }
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
    const { nombre_completo, usuario, email, id_rol, estado } = req.body;
    
    // VALIDACIÓN: No permitir desactivar al administrador principal (id=1 o id_rol=1)
    if (parseInt(id) === 1 || parseInt(id_rol) === 1) {
      if (estado === 0 || estado === 'inactivo') {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede desactivar el administrador principal del sistema' 
        });
      }
    }
    
    // VALIDACIÓN: Si se cambia el rol, verificar que esté activo
    if (id_rol) {
      const roleCheck = await pool.query(
        'SELECT estado FROM roles WHERE id_rol = $1',
        [id_rol]
      );
      
      if (roleCheck.rows.length > 0 && roleCheck.rows[0].estado === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede asignar un rol inactivo al usuario' 
        });
      }
    }
    
    // VALIDACIÓN: Si se activa el usuario, verificar que su rol esté activo
    if (estado === 1 || estado === 'activo') {
      const userRole = await pool.query(
        'SELECT id_rol FROM usuarios WHERE id_usuario = $1',
        [id]
      );
      
      if (userRole.rows.length > 0) {
        const roleId = id_rol || userRole.rows[0].id_rol;
        const roleCheck = await pool.query(
          'SELECT estado FROM roles WHERE id_rol = $1',
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
    
    const estadoNum = estado === 'activo' ? 1 : estado === 'inactivo' ? 0 : estado;
    
    const result = await pool.query(
      'UPDATE usuarios SET nombre_completo = $1, usuario = $2, email = $3, id_rol = $4, estado = $5 WHERE id_usuario = $6 RETURNING *',
      [nombre_completo, usuario, email, id_rol, estadoNum, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Usuario actualizado',
      data: { ...result.rows[0], estado: result.rows[0].estado === 1 ? 'activo' : 'inactivo' }
    });
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
    
    // VALIDACIÓN: No permitir desactivar al administrador principal (id=1)
    if (parseInt(id) === 1 && estado === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se puede desactivar el administrador principal del sistema' 
      });
    }
    
    // VALIDACIÓN: Si se activa el usuario, verificar que su rol esté activo
    if (estado === 1) {
      const userRole = await pool.query(
        `SELECT u.id_rol, r.estado as rol_estado 
         FROM usuarios u 
         JOIN roles r ON u.id_rol = r.id_rol 
         WHERE u.id_usuario = $1`,
        [id]
      );
      
      if (userRole.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }
      
      if (userRole.rows[0].rol_estado === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede activar el usuario porque su rol está inactivo' 
        });
      }
    }
    
    const result = await pool.query(
      'UPDATE usuarios SET estado = $1 WHERE id_usuario = $2 RETURNING *',
      [estado, id]
    );
    
    res.json({ 
      success: true, 
      message: `Usuario ${estado === 1 ? 'activado' : 'desactivado'}`,
      data: { ...result.rows[0], estado: result.rows[0].estado === 1 ? 'activo' : 'inactivo' }
    });
  } catch (e) {
    console.error('Error cambiando estado del usuario:', e);
    res.status(500).json({ success: false, message: 'Error cambiando estado del usuario' });
  }
};

// DELETE /api/usuarios/:id - Eliminar usuario
exports.deleteUsuario = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM usuarios WHERE id_usuario = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (e) {
    console.error('Error eliminando usuario:', e);
    res.status(500).json({ success: false, message: 'Error eliminando usuario' });
  }
};
