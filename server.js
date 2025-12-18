const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// ✅ CONEXIÓN A LA BASE DE DATOS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'psql 'postgresql://neondb_owner:npg_SpX8GMWUAK3i@ep-bitter-violet-adtn9x61-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'',
  ssl: { rejectUnauthorized: false }
});

// CONFIGURACIÓN
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE DE LOGS ====================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', JSON.stringify(req.body));
  }
  next();
});

// ==================== ENDPOINT RAÍZ ====================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ API STOCKBAR - VERSIÓN 10.0 (SISTEMA COMPLETO CON REGLAS DE NEGOCIO)',
    version: '10.0.0',
    status: 'operacional',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        login: 'POST /api/login',
        verifyEmail: 'POST /api/verify-email',
        sendRecovery: 'POST /api/send-recovery-email',
        updatePassword: 'POST /api/update-password',
        sendConfirmation: 'POST /api/send-confirmation-email'
      },
      modules: {
        roles: 'CRUD /api/roles',
        usuarios: 'CRUD /api/usuarios',
        categorias: 'CRUD /api/categorias',
        productos: 'CRUD /api/productos',
        proveedores: 'CRUD /api/proveedores',
        compras: 'CRUD /api/compras',
        clientes: 'CRUD /api/clientes',
        ventas: 'CRUD /api/ventas',
        permisos: 'GET /api/permisos'
      },
      utilities: {
        test: 'GET /api/test',
        checkDb: 'GET /api/check-db',
        dashboard: 'GET /api/dashboard'
      }
    }
  });
});

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const authenticateToken = async (req, res, next) => {
  try {
    let token = req.headers['authorization'];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token requerido' 
      });
    }
    
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
    
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [userId] = decoded.split(':');
    
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND estado = 1',
      [parseInt(userId)]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no válido o inactivo' 
      });
    }
    
    req.user = result.rows[0];
    next();
    
  } catch (error) {
    console.error('Error autenticación:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Token inválido' 
    });
  }
};

// ==================== MIDDLEWARE DE VALIDACIÓN DE ADMIN ====================
const validateNotAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Verificar si es usuario administrador por defecto (id_usuario = 1)
    if (parseInt(id) === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede modificar/eliminar al administrador por defecto'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validación admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en validación' 
    });
  }
};

// ==================== ENDPOINTS DE AUTENTICACIÓN ====================

// VERIFICAR EMAIL
app.post('/api/verify-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        exists: false,
        message: 'Email requerido' 
      });
    }
    
    const result = await pool.query(
      'SELECT id_usuario, email, nombre_completo FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        exists: false,
        message: 'Email no registrado'
      });
    }
    
    res.json({
      success: true,
      exists: true,
      message: 'Email registrado en el sistema',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('ERROR verify-email:', error);
    res.status(500).json({ 
      success: false, 
      exists: false,
      message: 'Error del servidor' 
    });
  }
});

// ENVIAR EMAIL DE RECUPERACIÓN
app.post('/api/send-recovery-email', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    
    if (!email || !codigo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y código requeridos' 
      });
    }
    
    const userResult = await pool.query(
      'SELECT nombre_completo FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Email no registrado' 
      });
    }
    
    console.log(`✅ Código generado para ${email}: ${codigo}`);
    
    res.json({
      success: true,
      message: 'Código generado exitosamente',
      data: {
        email: email,
        codigo: codigo,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('ERROR send-recovery-email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor'
    });
  }
});

// ACTUALIZAR CONTRASEÑA (VERSIÓN CORREGIDA - SIN Ñ)
app.post('/api/update-password', async (req, res) => {
  console.log('🔐 UPDATE-PASSWORD - VERSIÓN CORREGIDA');
  
  try {
    const { email, nuevaPassword } = req.body;
    
    console.log('📧 Email:', email);
    console.log('🔑 Password recibido:', nuevaPassword ? 'PRESENTE' : 'AUSENTE');
    
    if (!email || !nuevaPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    if (nuevaPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'La contraseña debe tener al menos 6 caracteres' 
      });
    }
    
    // Buscar usuario
    const userResult = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    // Hashear
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
    
    // ✅ CORREGIDO: usar contrasena (sin ñ, sin comillas)
    const updateResult = await pool.query(
      'UPDATE usuarios SET contrasena = $1 WHERE email = $2',
      [hashedPassword, email]
    );
    
    console.log('✅ UPDATE exitoso. Filas afectadas:', updateResult.rowCount);
    
    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
      data: { 
        email: email, 
        updated: true,
        user_id: userResult.rows[0].id_usuario 
      }
    });
    
  } catch (error) {
    console.error('🔥 ERROR update-password:', error.message);
    console.error('🔥 Detalle:', error.detail);
    
    res.status(500).json({ 
      success: false, 
      message: `Error del servidor: ${error.message}`,
      error_detail: error.detail
    });
  }
});

// LOGIN (VERSIÓN CORREGIDA - SIN Ñ)
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    // ✅ CORREGIDO: usar contrasena (sin ñ, sin comillas)
    const result = await pool.query(
      'SELECT id_usuario, email, nombre_completo, usuario, estado, id_rol, contrasena FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const user = result.rows[0];
    const dbPassword = user.contrasena || ''; // ✅ Cambiado aquí también
    
    console.log('🔐 Login - Password en BD:', dbPassword ? 'PRESENTE' : 'VACÍO');
    console.log('🔐 Login - Password recibida:', password);
    
    let validPassword = false;
    
    // Verificación de password
    if (dbPassword === password) {
      validPassword = true;
      console.log('✅ Password coincide directamente');
    }
    else if (dbPassword.startsWith('$2')) {
      // Es hash bcrypt
      validPassword = await bcrypt.compare(password, dbPassword);
      console.log('✅ Comparación bcrypt:', validPassword);
    }
    else if (password === 'admin123') {
      validPassword = true;
      console.log('✅ Password admin por defecto');
    }
    
    if (!validPassword) {
      console.log('❌ Password inválida');
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }
    
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
    const userResponse = {
      id_usuario: user.id_usuario,
      email: user.email,
      nombre_completo: user.nombre_completo || 'Administrador',
      usuario: user.usuario || 'admin',
      estado: user.estado || 1,
      id_rol: user.id_rol || 1
    };
    
    res.json({
      success: true,
      message: 'Login exitoso',
      token: token,
      user: userResponse,
      expires_in: '30 días'
    });
    
  } catch (error) {
    console.error('ERROR login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  }
});

// ==================== MÓDULO: ROLES ====================

// LISTAR ROLES
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM roles ORDER BY id_rol'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar roles:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo roles' 
    });
  }
});

// BUSCAR ROL POR ID
app.get('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM roles WHERE id_rol = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rol no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando rol' 
    });
  }
});

// CREAR ROL
app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    const { nombre_rol, descripcion, estado = 1 } = req.body;
    
    if (!nombre_rol) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre del rol es requerido' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO roles (nombre_rol, descripcion, estado) 
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre_rol, descripcion, estado]
    );
    
    res.json({
      success: true,
      message: 'Rol creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando rol' 
    });
  }
});

// ACTUALIZAR ROL
app.put('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_rol, descripcion, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE roles SET 
        nombre_rol = COALESCE($1, nombre_rol),
        descripcion = COALESCE($2, descripcion),
        estado = COALESCE($3, estado)
       WHERE id_rol = $4 RETURNING *`,
      [nombre_rol, descripcion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rol no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Rol actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando rol' 
    });
  }
});

// ELIMINAR ROL (Solo si no tiene usuarios relacionados)
app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el rol tiene usuarios asignados
    const usuariosResult = await pool.query(
      'SELECT COUNT(*) as total FROM usuarios WHERE id_rol = $1 AND estado = 1',
      [id]
    );
    
    if (parseInt(usuariosResult.rows[0].total) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el rol porque tiene usuarios activos asignados'
      });
    }
    
    // Verificar si el rol está activo
    const rolResult = await pool.query(
      'SELECT estado FROM roles WHERE id_rol = $1',
      [id]
    );
    
    if (rolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rol no encontrado'
      });
    }
    
    if (rolResult.rows[0].estado === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un rol activo. Primero desactívelo.'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM roles WHERE id_rol = $1 RETURNING *',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Rol eliminado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando rol' 
    });
  }
});

// CAMBIAR ESTADO DE ROL
app.put('/api/roles/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE roles SET estado = $1 WHERE id_rol = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rol no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del rol actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado rol:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del rol' 
    });
  }
});

// ASIGNAR PERMISOS A ROL
app.post('/api/roles/:id/permisos', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { permisos } = req.body;
    
    if (!permisos || !Array.isArray(permisos)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lista de permisos requerida' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      await client.query(
        'DELETE FROM ver_detalle_rol WHERE id_rol = $1',
        [id]
      );
      
      for (const permiso of permisos) {
        await client.query(
          'INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)',
          [id, permiso.id_permiso]
        );
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Permisos asignados exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error asignar permisos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error asignando permisos' 
    });
  }
});

// OBTENER PERMISOS DE UN ROL
app.get('/api/roles/:id/permisos', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT p.* FROM permisos p
       JOIN ver_detalle_rol v ON p.id_permiso = v.id_permiso
       WHERE v.id_rol = $1`,
      [id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error obtener permisos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo permisos' 
    });
  }
});

// ==================== MÓDULO: USUARIOS ====================

// LISTAR USUARIOS
app.get('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ORDER BY u.id_usuario
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar usuarios:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo usuarios' 
    });
  }
});

// BUSCAR USUARIO POR ID
app.get('/api/usuarios/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando usuario' 
    });
  }
});

// CREAR USUARIO (CORREGIDO - SIN Ñ)
app.post('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const { id_rol, nombre_completo, email, usuario, contraseña, estado = 1 } = req.body;
    
    console.log('➕ Creando usuario:', { email, usuario, tienePassword: !!contraseña });
    
    if (!email || !contraseña || !nombre_completo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, contraseña y nombre son requeridos' 
      });
    }
    
    // Verificar si el rol existe
    if (id_rol) {
      const rolResult = await pool.query(
        'SELECT estado FROM roles WHERE id_rol = $1',
        [id_rol]
      );
      
      if (rolResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El rol seleccionado no existe'
        });
      }
      
      if (rolResult.rows[0].estado === 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede asignar un rol inactivo'
        });
      }
    }
    
    // Verificar email único
    const emailExists = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (emailExists.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El email ya está registrado' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(contraseña, 10);
    
    // ✅ CORREGIDO: usar contrasena (sin ñ, sin comillas)
    const result = await pool.query(
      `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contrasena, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_rol, nombre_completo, email, usuario, hashedPassword, estado]
    );
    
    console.log('✅ Usuario creado. ID:', result.rows[0].id_usuario);
    
    res.json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('🔥 Error crear usuario:', error);
    console.error('🔥 Detalle:', error.detail);
    
    res.status(500).json({ 
      success: false, 
      message: `Error creando usuario: ${error.message}`,
      error_detail: error.detail
    });
  }
});

// ACTUALIZAR USUARIO (CORREGIDO - SIN Ñ)
app.put('/api/usuarios/:id', authenticateToken, validateNotAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { id_rol, nombre_completo, email, usuario, contraseña, estado } = req.body;
    
    console.log('🔄 Actualizando usuario ID:', id);
    console.log('📦 Datos recibidos:', { id_rol, nombre_completo, email, usuario, tienePassword: !!contraseña, estado });
    
    // Verificar si el rol existe
    if (id_rol) {
      const rolResult = await pool.query(
        'SELECT estado FROM roles WHERE id_rol = $1',
        [id_rol]
      );
      
      if (rolResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El rol seleccionado no existe'
        });
      }
    }
    
    let updateQuery = `
      UPDATE usuarios SET 
        id_rol = COALESCE($1, id_rol),
        nombre_completo = COALESCE($2, nombre_completo),
        email = COALESCE($3, email),
        usuario = COALESCE($4, usuario),
        estado = COALESCE($5, estado)
    `;
    
    const queryParams = [id_rol, nombre_completo, email, usuario, estado, id];
    
    if (contraseña) {
      console.log('🔐 Actualizando contraseña para usuario:', id);
      const hashedPassword = await bcrypt.hash(contraseña, 10);
      // ✅ CORREGIDO: usar contrasena (sin ñ, sin comillas)
      updateQuery += ', contrasena = $6';
      queryParams.splice(5, 0, hashedPassword);
    }
    
    updateQuery += ' WHERE id_usuario = $' + queryParams.length + ' RETURNING *';
    
    console.log('📝 Query final:', updateQuery);
    console.log('📝 Parámetros:', queryParams);
    
    const result = await pool.query(updateQuery, queryParams);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('🔥 Error actualizar usuario:', error);
    console.error('🔥 Detalle:', error.detail);
    console.error('🔥 Código:', error.code);
    
    res.status(500).json({ 
      success: false, 
      message: `Error actualizando usuario: ${error.message}`,
      error_detail: error.detail
    });
  }
});

// ELIMINAR USUARIO (Solo si está inactivo y no es admin)
app.delete('/api/usuarios/:id', authenticateToken, validateNotAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el usuario existe y su estado
    const userResult = await pool.query(
      'SELECT estado FROM usuarios WHERE id_usuario = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    if (userResult.rows[0].estado === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un usuario activo. Primero desactívelo.'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM usuarios WHERE id_usuario = $1 RETURNING *',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando usuario' 
    });
  }
});

// CAMBIAR ESTADO DE USUARIO
app.put('/api/usuarios/:id/estado', authenticateToken, validateNotAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE usuarios SET estado = $1 WHERE id_usuario = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del usuario actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado usuario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del usuario' 
    });
  }
});

// ==================== MÓDULO: CATEGORÍAS ====================

// LISTAR CATEGORÍAS
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categorias ORDER BY nombre'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar categorías:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo categorías' 
    });
  }
});

// BUSCAR CATEGORÍA POR ID
app.get('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM categorias WHERE id_categoria = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Categoría no encontrada' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando categoría' 
    });
  }
});

// CREAR CATEGORÍA
app.post('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, estado = 1 } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre de categoría es requerido' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO categorias (nombre, descripcion, estado) 
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre, descripcion, estado]
    );
    
    res.json({
      success: true,
      message: 'Categoría creada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando categoría' 
    });
  }
});

// ACTUALIZAR CATEGORÍA
app.put('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE categorias SET 
        nombre = COALESCE($1, nombre),
        descripcion = COALESCE($2, descripcion),
        estado = COALESCE($3, estado)
       WHERE id_categoria = $4 RETURNING *`,
      [nombre, descripcion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Categoría no encontrada' 
      });
    }
    
    res.json({
      success: true,
      message: 'Categoría actualizada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando categoría' 
    });
  }
});

// ELIMINAR CATEGORÍA (Solo si no tiene productos y está inactiva)
app.delete('/api/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si la categoría tiene productos
    const productosResult = await pool.query(
      'SELECT COUNT(*) as total FROM productos WHERE id_categoria = $1',
      [id]
    );
    
    if (parseInt(productosResult.rows[0].total) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar la categoría porque tiene productos asociados'
      });
    }
    
    // Verificar si la categoría está activa
    const categoriaResult = await pool.query(
      'SELECT estado FROM categorias WHERE id_categoria = $1',
      [id]
    );
    
    if (categoriaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
    
    if (categoriaResult.rows[0].estado === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar una categoría activa. Primero desactívela.'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM categorias WHERE id_categoria = $1 RETURNING *',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Categoría eliminada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando categoría' 
    });
  }
});

// CAMBIAR ESTADO DE CATEGORÍA
app.put('/api/categorias/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE categorias SET estado = $1 WHERE id_categoria = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Categoría no encontrada' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado de categoría actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado categoría:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado de categoría' 
    });
  }
});

// ==================== MÓDULO: PRODUCTOS ====================

// LISTAR PRODUCTOS
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      ORDER BY p.nombre
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar productos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo productos' 
    });
  }
});

// BUSCAR PRODUCTO POR ID
app.get('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      WHERE p.id_producto = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando producto' 
    });
  }
});

// CREAR PRODUCTO
app.post('/api/productos', authenticateToken, async (req, res) => {
  try {
    const { 
      id_categoria, 
      nombre, 
      stock = 0, 
      precio_compra, 
      precio_venta, 
      estado = 1 
    } = req.body;
    
    if (!nombre || precio_compra === undefined || precio_venta === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre y precios son requeridos' 
      });
    }
    
    // Verificar si la categoría existe (si se asigna)
    if (id_categoria) {
      const categoriaResult = await pool.query(
        'SELECT estado FROM categorias WHERE id_categoria = $1',
        [id_categoria]
      );
      
      if (categoriaResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La categoría seleccionada no existe'
        });
      }
      
      if (categoriaResult.rows[0].estado === 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede asignar una categoría inactiva'
        });
      }
    }
    
    const result = await pool.query(
      `INSERT INTO productos 
       (id_categoria, nombre, stock, precio_compra, precio_venta, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado]
    );
    
    res.json({
      success: true,
      message: 'Producto creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando producto' 
    });
  }
});

// ACTUALIZAR PRODUCTO
app.put('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      id_categoria, 
      nombre, 
      stock, 
      precio_compra, 
      precio_venta, 
      estado 
    } = req.body;
    
    // Verificar si la categoría existe (si se está actualizando)
    if (id_categoria) {
      const categoriaResult = await pool.query(
        'SELECT estado FROM categorias WHERE id_categoria = $1',
        [id_categoria]
      );
      
      if (categoriaResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La categoría seleccionada no existe'
        });
      }
    }
    
    const result = await pool.query(
      `UPDATE productos SET 
        id_categoria = COALESCE($1, id_categoria),
        nombre = COALESCE($2, nombre),
        stock = COALESCE($3, stock),
        precio_compra = COALESCE($4, precio_compra),
        precio_venta = COALESCE($5, precio_venta),
        estado = COALESCE($6, estado)
       WHERE id_producto = $7 RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando producto' 
    });
  }
});

// ELIMINAR PRODUCTO (Solo si no tiene transacciones y está inactivo)
app.delete('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el producto tiene transacciones (compras o ventas)
    const comprasResult = await pool.query(
      'SELECT COUNT(*) as total FROM detalle_compras WHERE id_producto = $1',
      [id]
    );
    
    const ventasResult = await pool.query(
      'SELECT COUNT(*) as total FROM detalle_ventas WHERE id_producto = $1',
      [id]
    );
    
    const totalTransacciones = 
      parseInt(comprasResult.rows[0].total) + 
      parseInt(ventasResult.rows[0].total);
    
    if (totalTransacciones > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el producto porque tiene transacciones registradas'
      });
    }
    
    // Verificar si el producto está activo
    const productoResult = await pool.query(
      'SELECT estado FROM productos WHERE id_producto = $1',
      [id]
    );
    
    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }
    
    if (productoResult.rows[0].estado === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un producto activo. Primero desactívelo.'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM productos WHERE id_producto = $1 RETURNING *',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Producto eliminado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando producto' 
    });
  }
});

// CAMBIAR ESTADO DE PRODUCTO
app.put('/api/productos/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE productos SET estado = $1 WHERE id_producto = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del producto actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado producto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del producto' 
    });
  }
});

// ==================== MÓDULO: PROVEEDORES ====================

// LISTAR PROVEEDORES
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM proveedores ORDER BY nombre_razon_social'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar proveedores:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo proveedores' 
    });
  }
});

// BUSCAR PROVEEDOR POR ID
app.get('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM proveedores WHERE id_proveedor = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proveedor no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando proveedor' 
    });
  }
});

// CREAR PROVEEDOR
app.post('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const { 
      nombre_razon_social, 
      tipo_documento, 
      documento, 
      contacto, 
      telefono, 
      email, 
      direccion, 
      estado = 1 
    } = req.body;
    
    if (!nombre_razon_social || !documento) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre y documento son requeridos' 
      });
    }
    
    // Verificar si ya existe un proveedor con el mismo documento
    const documentoExists = await pool.query(
      'SELECT * FROM proveedores WHERE documento = $1',
      [documento]
    );
    
    if (documentoExists.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ya existe un proveedor con este documento' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO proveedores 
       (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado]
    );
    
    res.json({
      success: true,
      message: 'Proveedor creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando proveedor' 
    });
  }
});

// ACTUALIZAR PROVEEDOR
app.put('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombre_razon_social, 
      tipo_documento, 
      documento, 
      contacto, 
      telefono, 
      email, 
      direccion, 
      estado 
    } = req.body;
    
    const result = await pool.query(
      `UPDATE proveedores SET 
        nombre_razon_social = COALESCE($1, nombre_razon_social),
        tipo_documento = COALESCE($2, tipo_documento),
        documento = COALESCE($3, documento),
        contacto = COALESCE($4, contacto),
        telefono = COALESCE($5, telefono),
        email = COALESCE($6, email),
        direccion = COALESCE($7, direccion),
        estado = COALESCE($8, estado)
       WHERE id_proveedor = $9 RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proveedor no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Proveedor actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando proveedor' 
    });
  }
});

// ELIMINAR PROVEEDOR (Solo si no tiene compras activas y está inactivo)
app.delete('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el proveedor tiene compras activas (estado = 1)
    const comprasResult = await pool.query(
      'SELECT COUNT(*) as total FROM compras WHERE id_proveedor = $1 AND estado = 1',
      [id]
    );
    
    if (parseInt(comprasResult.rows[0].total) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el proveedor porque tiene compras activas'
      });
    }
    
    // Verificar si el proveedor está activo
    const proveedorResult = await pool.query(
      'SELECT estado FROM proveedores WHERE id_proveedor = $1',
      [id]
    );
    
    if (proveedorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }
    
    if (proveedorResult.rows[0].estado === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un proveedor activo. Primero desactívelo.'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM proveedores WHERE id_proveedor = $1 RETURNING *',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Proveedor eliminado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando proveedor' 
    });
  }
});

// CAMBIAR ESTADO DE PROVEEDOR
app.put('/api/proveedores/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE proveedores SET estado = $1 WHERE id_proveedor = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proveedor no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del proveedor actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado proveedor:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del proveedor' 
    });
  }
});

// ==================== MÓDULO: CLIENTES ====================

// LISTAR CLIENTES
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clientes ORDER BY nombre'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar clientes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo clientes' 
    });
  }
});

// BUSCAR CLIENTE POR ID
app.get('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM clientes WHERE id_cliente = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cliente no encontrado' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error buscar cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando cliente' 
    });
  }
});

// CREAR CLIENTE
app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { 
      nombre, 
      tipo_documento, 
      documento, 
      telefono, 
      direccion, 
      estado = 1 
    } = req.body;
    
    if (!nombre || !documento) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre y documento son requeridos' 
      });
    }
    
    // Verificar si ya existe un cliente con el mismo documento
    const documentoExists = await pool.query(
      'SELECT * FROM clientes WHERE documento = $1',
      [documento]
    );
    
    if (documentoExists.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ya existe un cliente con este documento' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO clientes 
       (nombre, tipo_documento, documento, telefono, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, estado]
    );
    
    res.json({
      success: true,
      message: 'Cliente creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando cliente' 
    });
  }
});

// ACTUALIZAR CLIENTE
app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombre, 
      tipo_documento, 
      documento, 
      telefono, 
      direccion, 
      estado 
    } = req.body;
    
    const result = await pool.query(
      `UPDATE clientes SET 
        nombre = COALESCE($1, nombre),
        tipo_documento = COALESCE($2, tipo_documento),
        documento = COALESCE($3, documento),
        telefono = COALESCE($4, telefono),
        direccion = COALESCE($5, direccion),
        estado = COALESCE($6, estado)
       WHERE id_cliente = $7 RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cliente no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando cliente' 
    });
  }
});

// ELIMINAR CLIENTE (Solo si no tiene ventas activas y está inactivo)
app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si el cliente tiene ventas activas (estado diferente de 'Anulada')
    const ventasResult = await pool.query(
      `SELECT COUNT(*) as total FROM ventas 
       WHERE id_cliente = $1 AND estado != 'Anulada'`,
      [id]
    );
    
    if (parseInt(ventasResult.rows[0].total) > 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el cliente porque tiene ventas activas'
      });
    }
    
    // Verificar si el cliente está activo
    const clienteResult = await pool.query(
      'SELECT estado FROM clientes WHERE id_cliente = $1',
      [id]
    );
    
    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }
    
    if (clienteResult.rows[0].estado === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar un cliente activo. Primero desactívelo.'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM clientes WHERE id_cliente = $1 RETURNING *',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Cliente eliminado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando cliente' 
    });
  }
});

// CAMBIAR ESTADO DE CLIENTE
app.put('/api/clientes/:id/estado', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Estado requerido' 
      });
    }
    
    const result = await pool.query(
      'UPDATE clientes SET estado = $1 WHERE id_cliente = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cliente no encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Estado del cliente actualizado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cambiar estado cliente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado del cliente' 
    });
  }
});

// ==================== MÓDULO: COMPRAS ====================

// LISTAR COMPRAS
app.get('/api/compras', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor
      ORDER BY c.fecha DESC
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar compras:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo compras' 
    });
  }
});

// BUSCAR COMPRA POR ID CON DETALLES
app.get('/api/compras/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const compraResult = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor
      WHERE c.id_compra = $1
    `, [id]);
    
    if (compraResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Compra no encontrada' 
      });
    }
    
    const detallesResult = await pool.query(`
      SELECT dc.*, pr.nombre as producto_nombre
      FROM detalle_compras dc
      LEFT JOIN productos pr ON dc.id_producto = pr.id_producto
      WHERE dc.id_compra = $1
    `, [id]);
    
    const compra = compraResult.rows[0];
    compra.detalles = detallesResult.rows;
    
    res.json({
      success: true,
      data: compra
    });
  } catch (error) {
    console.error('Error buscar compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando compra' 
    });
  }
});

// CREAR COMPRA
app.post('/api/compras', authenticateToken, async (req, res) => {
  try {
    const { 
      id_proveedor, 
      fecha, 
      total, 
      numero_factura, 
      estado = 1,
      detalles 
    } = req.body;
    
    if (!id_proveedor || !total || !detalles || !Array.isArray(detalles)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Proveedor, total y detalles son requeridos' 
      });
    }
    
    // Verificar si el proveedor existe y está activo
    const proveedorResult = await pool.query(
      'SELECT estado FROM proveedores WHERE id_proveedor = $1',
      [id_proveedor]
    );
    
    if (proveedorResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'El proveedor seleccionado no existe'
      });
    }
    
    if (proveedorResult.rows[0].estado === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede realizar una compra a un proveedor inactivo'
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const compraResult = await client.query(
        `INSERT INTO compras 
         (id_proveedor, fecha, total, numero_factura, estado) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id_compra`,
        [id_proveedor, fecha || new Date(), total, numero_factura, estado]
      );
      
      const compraId = compraResult.rows[0].id_compra;
      
      for (const detalle of detalles) {
        await client.query(
          `INSERT INTO detalle_compras 
           (id_compra, id_producto, cantidad, precio, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [compraId, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        await client.query(
          'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Compra creada exitosamente',
        data: { id_compra: compraId }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error crear compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando compra' 
    });
  }
});

// ACTUALIZAR COMPRA (Solo si está pendiente)
app.put('/api/compras/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      id_proveedor, 
      fecha, 
      total, 
      numero_factura, 
      estado,
      detalles 
    } = req.body;
    
    // Verificar si la compra existe y está pendiente (estado = 1)
    const compraExistente = await pool.query(
      'SELECT estado FROM compras WHERE id_compra = $1',
      [id]
    );
    
    if (compraExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }
    
    if (compraExistente.rows[0].estado !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden editar compras pendientes'
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Restaurar stock de detalles antiguos
      const detallesAntiguos = await client.query(
        'SELECT id_producto, cantidad FROM detalle_compras WHERE id_compra = $1',
        [id]
      );
      
      for (const detalle of detallesAntiguos.rows) {
        await client.query(
          'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      // 2. Eliminar detalles antiguos
      await client.query('DELETE FROM detalle_compras WHERE id_compra = $1', [id]);
      
      // 3. Actualizar compra principal
      await client.query(
        `UPDATE compras SET 
          id_proveedor = COALESCE($1, id_proveedor),
          fecha = COALESCE($2, fecha),
          total = COALESCE($3, total),
          numero_factura = COALESCE($4, numero_factura),
          estado = COALESCE($5, estado)
         WHERE id_compra = $6`,
        [id_proveedor, fecha, total, numero_factura, estado, id]
      );
      
      // 4. Agregar nuevos detalles y actualizar stock
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          await client.query(
            `INSERT INTO detalle_compras 
             (id_compra, id_producto, cantidad, precio, subtotal) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
          );
          
          await client.query(
            'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Compra actualizada exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error actualizar compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando compra' 
    });
  }
});

// ELIMINAR COMPRA (Solo si está inactiva/anulada)
app.delete('/api/compras/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar si la compra existe y su estado
    const compraResult = await pool.query(
      'SELECT estado FROM compras WHERE id_compra = $1',
      [id]
    );
    
    if (compraResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compra no encontrada'
      });
    }
    
    if (compraResult.rows[0].estado === 1) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar una compra activa. Primero anúlela.'
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Restaurar stock (si la compra estaba activa antes de ser anulada)
      const detalles = await client.query(
        'SELECT id_producto, cantidad FROM detalle_compras WHERE id_compra = $1',
        [id]
      );
      
      for (const detalle of detalles.rows) {
        await client.query(
          'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      // 2. Eliminar detalles
      await client.query('DELETE FROM detalle_compras WHERE id_compra = $1', [id]);
      
      // 3. Eliminar compra
      const result = await client.query(
        'DELETE FROM compras WHERE id_compra = $1 RETURNING *',
        [id]
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Compra eliminada exitosamente',
        data: result.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error eliminar compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando compra' 
    });
  }
});

// ANULAR COMPRA
app.put('/api/compras/:id/anular', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const detallesResult = await client.query(
        'SELECT * FROM detalle_compras WHERE id_compra = $1',
        [id]
      );
      
      for (const detalle of detallesResult.rows) {
        await client.query(
          'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      const result = await client.query(
        'UPDATE compras SET estado = 0 WHERE id_compra = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Compra no encontrada');
      }
      
      await client.query(
        'INSERT INTO logs_anulaciones (id_compra, motivo, fecha) VALUES ($1, $2, NOW())',
        [id, motivo || 'Anulación por usuario']
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Compra anulada exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error anular compra:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error anulando compra' 
    });
  }
});

// ==================== MÓDULO: VENTAS ====================

// LISTAR VENTAS
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre 
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar ventas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo ventas' 
    });
  }
});

// BUSCAR VENTA POR ID CON DETALLES
app.get('/api/ventas/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ventaResult = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre 
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      WHERE v.id_venta = $1
    `, [id]);
    
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Venta no encontrada' 
      });
    }
    
    const detallesResult = await pool.query(`
      SELECT d.*, p.nombre as producto_nombre
      FROM detalle_ventas d
      LEFT JOIN productos p ON d.id_producto = p.id_producto
      WHERE d.id_venta = $1
    `, [id]);
    
    const venta = ventaResult.rows[0];
    venta.detalles = detallesResult.rows;
    
    res.json({
      success: true,
      data: venta
    });
  } catch (error) {
    console.error('Error buscar venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error buscando venta' 
    });
  }
});

// DETALLES DE VENTA
app.get('/api/ventas/:id/detalles', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    
    const result = await pool.query(`
      SELECT d.*, p.nombre as producto_nombre
      FROM detalle_ventas d
      LEFT JOIN productos p ON d.id_producto = p.id_producto
      WHERE d.id_venta = $1
    `, [ventaId]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error detalles venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo detalles' 
    });
  }
});

// CREAR VENTA
app.post('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const { id_cliente, total, estado, fecha, detalles } = req.body;
    
    // Verificar si el cliente existe y está activo
    if (id_cliente) {
      const clienteResult = await pool.query(
        'SELECT estado FROM clientes WHERE id_cliente = $1',
        [id_cliente]
      );
      
      if (clienteResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El cliente seleccionado no existe'
        });
      }
      
      if (clienteResult.rows[0].estado === 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede realizar una venta a un cliente inactivo'
        });
      }
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const ventaResult = await client.query(
        `INSERT INTO ventas (id_cliente, total, estado, fecha) 
         VALUES ($1, $2, $3, $4) RETURNING id_venta`,
        [id_cliente, total, estado || 'Pendiente', fecha || new Date()]
      );
      
      const ventaId = ventaResult.rows[0].id_venta;
      
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          // Verificar stock disponible
          const productoResult = await client.query(
            'SELECT stock FROM productos WHERE id_producto = $1',
            [detalle.id_producto]
          );
          
          if (productoResult.rows.length === 0) {
            throw new Error(`Producto ID ${detalle.id_producto} no encontrado`);
          }
          
          if (productoResult.rows[0].stock < detalle.cantidad) {
            throw new Error(`Stock insuficiente para el producto ID ${detalle.id_producto}`);
          }
          
          await client.query(
            `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [ventaId, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
          );
          
          await client.query(
            'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Venta creada exitosamente',
        data: { id_venta: ventaId }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('ERROR crear venta:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error creando venta' 
    });
  }
});

// ACTUALIZAR VENTA (Solo si está pendiente)
app.put('/api/ventas/:id', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    const { id_cliente, total, estado, fecha, detalles } = req.body;
    
    // Verificar si la venta existe y está pendiente
    const ventaExistente = await pool.query(
      'SELECT id_venta, estado FROM ventas WHERE id_venta = $1',
      [ventaId]
    );
    
    if (ventaExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }
    
    if (ventaExistente.rows[0].estado !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden editar ventas pendientes'
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Restaurar stock de detalles antiguos
      const detallesAntiguos = await client.query(
        'SELECT id_producto, cantidad FROM detalle_ventas WHERE id_venta = $1',
        [ventaId]
      );
      
      for (const detalle of detallesAntiguos.rows) {
        await client.query(
          'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      // 2. Eliminar detalles antiguos
      await client.query('DELETE FROM detalle_ventas WHERE id_venta = $1', [ventaId]);
      
      // 3. Actualizar venta principal
      await client.query(
        `UPDATE ventas 
         SET id_cliente = $1, total = $2, estado = $3, fecha = $4
         WHERE id_venta = $5`,
        [id_cliente, total, estado || 'Pendiente', fecha || new Date(), ventaId]
      );
      
      // 4. Agregar nuevos detalles y descontar stock
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          // Verificar stock disponible
          const productoResult = await client.query(
            'SELECT stock FROM productos WHERE id_producto = $1',
            [detalle.id_producto]
          );
          
          if (productoResult.rows[0].stock < detalle.cantidad) {
            throw new Error(`Stock insuficiente para el producto ID ${detalle.id_producto}`);
          }
          
          await client.query(
            `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [ventaId, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
          );
          
          await client.query(
            'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Venta actualizada exitosamente',
        data: { id_venta: ventaId }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('ERROR actualizar venta:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error actualizando venta' 
    });
  }
});

// ANULAR VENTA
app.put('/api/ventas/:id/anular', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const detallesResult = await client.query(
        'SELECT * FROM detalle_ventas WHERE id_venta = $1',
        [id]
      );
      
      for (const detalle of detallesResult.rows) {
        await client.query(
          'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      const result = await client.query(
        `UPDATE ventas SET estado = 'Anulada' WHERE id_venta = $1 RETURNING *`,
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Venta no encontrada');
      }
      
      await client.query(
        'INSERT INTO logs_anulaciones (id_venta, motivo, fecha) VALUES ($1, $2, NOW())',
        [id, motivo || 'Anulación por usuario']
      );
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Venta anulada exitosamente'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error anular venta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error anulando venta' 
    });
  }
});

// ACTUALIZAR ESTADO DE VENTA
app.put('/api/ventas/:id/estado', authenticateToken, async (req, res) => {
  try {
    const ventaId = req.params.id;
    const { estado } = req.body;
    
    await pool.query(
      'UPDATE ventas SET estado = $1 WHERE id_venta = $2',
      [estado, ventaId]
    );
    
    res.json({
      success: true,
      message: 'Estado actualizado'
    });
    
  } catch (error) {
    console.error('ERROR cambiar estado:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cambiando estado' 
    });
  }
});

// ==================== PERMISOS ====================

// LISTAR PERMISOS
app.get('/api/permisos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM permisos ORDER BY id_permiso'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error listar permisos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo permisos' 
    });
  }
});

// ==================== DASHBOARD ====================

// ESTADÍSTICAS DEL DASHBOARD
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const [
      totalProductos,
      totalClientes,
      totalProveedores,
      totalUsuarios,
      ventasHoy,
      comprasHoy,
      productosBajoStock,
      ventasMensuales
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM productos WHERE estado = 1'),
      pool.query('SELECT COUNT(*) as total FROM clientes WHERE estado = 1'),
      pool.query('SELECT COUNT(*) as total FROM proveedores WHERE estado = 1'),
      pool.query('SELECT COUNT(*) as total FROM usuarios WHERE estado = 1'),
      pool.query(`
        SELECT COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total 
        FROM ventas 
        WHERE DATE(fecha) = CURRENT_DATE AND estado != 'Anulada'
      `),
      pool.query(`
        SELECT COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total 
        FROM compras 
        WHERE DATE(fecha) = CURRENT_DATE AND estado = 1
      `),
      pool.query(`
        SELECT nombre, stock 
        FROM productos 
        WHERE stock <= 10 AND estado = 1 
        ORDER BY stock ASC 
        LIMIT 10
      `),
      pool.query(`
        SELECT 
          EXTRACT(MONTH FROM fecha) as mes,
          COUNT(*) as cantidad_ventas,
          COALESCE(SUM(total), 0) as total_ventas
        FROM ventas 
        WHERE estado != 'Anulada' 
          AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
        GROUP BY EXTRACT(MONTH FROM fecha)
        ORDER BY mes
      `)
    ]);
    
    res.json({
      success: true,
      data: {
        totalProductos: parseInt(totalProductos.rows[0].total),
        totalClientes: parseInt(totalClientes.rows[0].total),
        totalProveedores: parseInt(totalProveedores.rows[0].total),
        totalUsuarios: parseInt(totalUsuarios.rows[0].total),
        ventasHoy: {
          cantidad: parseInt(ventasHoy.rows[0].cantidad),
          total: parseFloat(ventasHoy.rows[0].total)
        },
        comprasHoy: {
          cantidad: parseInt(comprasHoy.rows[0].cantidad),
          total: parseFloat(comprasHoy.rows[0].total)
        },
        productosBajoStock: productosBajoStock.rows,
        ventasMensuales: ventasMensuales.rows
      }
    });
  } catch (error) {
    console.error('Error dashboard:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo estadísticas' 
    });
  }
});

// ==================== ENDPOINTS DE PRUEBA ====================

// TEST API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '10.0.0'
  });
});

// CHECK DATABASE
app.get('/api/check-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    res.json({
      success: true,
      message: 'Base de datos conectada',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error de base de datos',
      error: error.message
    });
  }
});

// ==================== MANEJO DE ERRORES 404 ====================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// ==================== INICIAR SERVIDOR ====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(80));
  console.log('🚀 API STOCKBAR - VERSIÓN 10.0 (SISTEMA COMPLETO CON REGLAS DE NEGOCIO)');
  console.log('='.repeat(80));
  console.log('✅ TODOS LOS MÓDULOS CON CRUD COMPLETO');
  console.log('✅ REGLAS DE NEGOCIO IMPLEMENTADAS');
  console.log('✅ VALIDACIONES DE INTEGRIDAD REFERENCIAL');
  console.log('✅ MIDDLEWARE DE AUTENTICACIÓN ACTIVADO');
  console.log('='.repeat(80));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🌍 URL pública: https://api-stockbar.onrender.com`);
  console.log('='.repeat(80));
  console.log('🔐 Login por defecto: thebar752@gmail.com | admin123');
  console.log('='.repeat(80));
  console.log('📋 REGLAS DE NEGOCIO IMPLEMENTADAS:');
  console.log('   • Administrador por defecto (ID 1) no se puede modificar/eliminar');
  console.log('   • Solo se eliminan registros inactivos');
  console.log('   • No se elimina si hay relaciones activas');
  console.log('   • Ventas solo se anulan, no se eliminan');
  console.log('   • Validación de stock en ventas');
  console.log('   • Validación de dependencias entre módulos');
  console.log('='.repeat(80));
  console.log('✅ Servidor listo para recibir peticiones!');
  console.log('='.repeat(80));
});

// MANEJO DE CIERRE
process.on('SIGTERM', () => {
  console.log('🛑 Cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    pool.end(() => {
      console.log('✅ Pool de DB cerrado');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Cerrando servidor (Ctrl+C)...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    pool.end(() => {
      console.log('✅ Pool de DB cerrado');
      process.exit(0);
    });
  });
});
