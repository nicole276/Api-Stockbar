// ============================================================
//  THE BAR - API SERVER  v12.0
//  Base de datos: Neon PostgreSQL
//  Autor: generado con Claude
// ============================================================

const express    = require('express');
const cors       = require('cors');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ── Variables de entorno ─────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'the-bar-super-secret-key-2026';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Middlewares globales ──────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Nodemailer ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error) => {
  if (error) console.error('Error en email:', error.message);
});

// ── Crear tablas si no existen ────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL,
    code       VARCHAR(10)  NOT NULL,
    expires_at TIMESTAMP    NOT NULL,
    used       BOOLEAN      DEFAULT FALSE
  )
`).catch(e => console.error('Error creando tabla password_resets:', e.message));

pool.query(`
  ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidades_por_paquete INT DEFAULT 1
`).catch(e => console.error('Error agregando columna unidades_por_paquete:', e.message));

// ════════════════════════════════════════════════════════════
//  MIDDLEWARES DE AUTH Y PERMISOS
// ════════════════════════════════════════════════════════════

const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token requerido' });
    }
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND estado = 1',
      [decoded.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario inactivo o no válido' });
    }
    req.user = { ...result.rows[0], userId: decoded.userId, roleId: decoded.roleId };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError')  return res.status(401).json({ success: false, message: 'Token expirado' });
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Token inválido' });
    console.error('Error autenticación:', error.message);
    res.status(500).json({ success: false, message: 'Error en autenticación' });
  }
};

const checkModuleAccess = (moduleName) => async (req, res, next) => {
  try {
    if (req.user.id_rol === 1) return next();
    const result = await pool.query(`
      SELECT p.nombre
      FROM permisos p
      JOIN ver_detalle_rol vdr ON p.id_permiso = vdr.id_permiso
      WHERE vdr.id_rol = $1 AND p.estado = 1
    `, [req.user.id_rol]);
    const modulos = result.rows.map(r => r.nombre);
    if (!modulos.includes(moduleName)) {
      return res.status(403).json({ success: false, message: `Sin permiso para: ${moduleName}` });
    }
    if (['REALIZAR_VENTAS','REALIZAR_COMPRAS'].includes(moduleName) && req.method === 'DELETE') {
      return res.status(403).json({ success: false, message: 'Solo el administrador puede eliminar ventas y compras' });
    }
    next();
  } catch (error) {
    console.error('Error permisos:', error.message);
    res.status(500).json({ success: false, message: 'Error al verificar permisos' });
  }
};

// ════════════════════════════════════════════════════════════
//  RAÍZ
// ════════════════════════════════════════════════════════════
app.get('/', (_req, res) => {
  res.json({ success: true, message: 'API THE BAR v12.0', version: '12.0.0' });
});

// ════════════════════════════════════════════════════════════
//  AUTH: LOGIN Y RECUPERACIÓN
// ════════════════════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos' });
    }
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }
    const user = result.rows[0];
    if (user.estado === 0) {
      return res.status(401).json({ success: false, message: 'Tu cuenta está inactiva. Contacta al administrador.' });
    }
    let validPassword = false;
    if (user.contrasena.startsWith('$2')) {
      validPassword = await bcrypt.compare(password, user.contrasena);
    } else {
      validPassword = user.contrasena === password;
    }
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }
    const token = jwt.sign(
      { userId: user.id_usuario, roleId: user.id_rol, userName: user.nombre_completo, userEmail: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    let permissions = [];
    if (user.id_rol === 1) {
      const allPerms = await pool.query('SELECT nombre FROM permisos WHERE estado = 1 ORDER BY nombre');
      permissions = allPerms.rows.map(r => ({ nombre_modulo: r.nombre }));
    } else {
      const permsResult = await pool.query(`
        SELECT p.nombre AS nombre_modulo
        FROM permisos p
        JOIN ver_detalle_rol vdr ON p.id_permiso = vdr.id_permiso
        WHERE vdr.id_rol = $1 AND p.estado = 1
        ORDER BY p.nombre
      `, [user.id_rol]);
      permissions = permsResult.rows;
    }
    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      user: {
        id_usuario: user.id_usuario,
        email: user.email,
        nombre_completo: user.nombre_completo,
        usuario: user.usuario,
        estado: user.estado,
        id_rol: user.id_rol
      },
      permissions
    });
  } catch (error) {
    console.error('ERROR login:', error.message);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});

// ── Recuperar contraseña ─────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = email?.trim().toLowerCase().replace(/\s+/g, '');
    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Correo requerido' });
    }
    const userResult = await pool.query(
      'SELECT id_usuario, email FROM usuarios WHERE LOWER(email) = $1',
      [cleanEmail]
    );
    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'Si el correo está registrado, recibirás un código.' });
    }
    const dbEmail = userResult.rows[0].email;
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
      "DELETE FROM password_resets WHERE LOWER(email) = $1 OR expires_at < NOW()",
      [cleanEmail]
    );
    await pool.query(
      "INSERT INTO password_resets (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [dbEmail, resetCode]
    );
    const mailOptions = {
      from: `"The Bar" <${process.env.EMAIL_USER}>`,
      to: dbEmail,
      subject: 'Recuperación de contraseña - The Bar',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="text-align:center;background:#3B2E2A;color:white;padding:20px;border-radius:10px;">
            <h2 style="margin:0;">The Bar</h2>
            <p style="margin:10px 0 0;font-size:14px;">Sistema de Gestión</p>
          </div>
          <div style="margin:20px 0;padding:20px;background:#f8f6f4;border-radius:10px;">
            <h3 style="color:#3B2E2A;">Recuperación de Contraseña</h3>
            <p>Hola, recibimos una solicitud para restablecer tu contraseña.</p>
            <div style="text-align:center;margin:20px 0;">
              <div style="background:#d6981c;color:#3B2E2A;font-size:36px;font-weight:bold;padding:20px 40px;border-radius:8px;display:inline-block;letter-spacing:10px;">
                ${resetCode}
              </div>
            </div>
            <p>Este código es válido por <strong>10 minutos</strong>.</p>
            <p style="color:#999;font-size:13px;">Si no solicitaste este cambio, ignora este mensaje.</p>
          </div>
          <div style="text-align:center;color:#999;font-size:12px;margin-top:20px;">
            © ${new Date().getFullYear()} The Bar – Sistema de Gestión
          </div>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Código enviado a tu correo' });
  } catch (error) {
    console.error('Error forgot-password:', error.message);
    res.status(500).json({ success: false, message: 'Error al enviar el código' });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail || !code) {
      return res.status(400).json({ success: false, message: 'Correo y código requeridos' });
    }
    const result = await pool.query(
      `SELECT * FROM password_resets
       WHERE LOWER(email) = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()`,
      [cleanEmail, code.toString().trim()]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Código incorrecto o expirado' });
    }
    res.json({ success: true, message: 'Código válido' });
  } catch (error) {
    console.error('Error verify-code:', error.message);
    res.status(500).json({ success: false, message: 'Error al verificar código' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail || !newPassword) {
      return res.status(400).json({ success: false, message: 'Correo y nueva contraseña requeridos' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const codeResult = await pool.query(
      `SELECT id FROM password_resets
       WHERE LOWER(email) = $1 AND used = FALSE AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [cleanEmail]
    );
    if (codeResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Sesión expirada. Solicita un nuevo código.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateResult = await pool.query(
      'UPDATE usuarios SET contrasena = $1 WHERE LOWER(email) = $2 RETURNING id_usuario',
      [hashedPassword, cleanEmail]
    );
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    await pool.query('UPDATE password_resets SET used = TRUE WHERE LOWER(email) = $1', [cleanEmail]);
    res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error reset-password:', error.message);
    res.status(500).json({ success: false, message: 'Error al cambiar contraseña' });
  }
});

// ════════════════════════════════════════════════════════════
//  MENÚ DINÁMICO
// ════════════════════════════════════════════════════════════
app.get('/api/user/menu', authenticateJWT, async (req, res) => {
  try {
    let rows;
    if (req.user.id_rol === 1) {
      const r = await pool.query('SELECT nombre FROM permisos WHERE estado = 1 ORDER BY nombre');
      rows = r.rows.map(x => ({ nombre_modulo: x.nombre }));
    } else {
      const r = await pool.query(`
        SELECT p.nombre AS nombre_modulo
        FROM permisos p
        JOIN ver_detalle_rol vdr ON p.id_permiso = vdr.id_permiso
        WHERE vdr.id_rol = $1 AND p.estado = 1
        ORDER BY p.nombre
      `, [req.user.id_rol]);
      rows = r.rows;
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error menú:', error.message);
    res.status(500).json({ success: false, message: 'Error obteniendo menú' });
  }
});

// ════════════════════════════════════════════════════════════
//  ROLES
// ════════════════════════════════════════════════════════════

app.get('/api/roles', authenticateJWT, checkModuleAccess('ROLES'), async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM roles WHERE 1=1';
    const params = []; let n = 1;
    if (search) { query += ` AND (nombre_rol ILIKE $${n} OR descripcion ILIKE $${n})`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND estado=$${n}`; params.push(parseInt(estado)); n++; }
    query += ' ORDER BY id_rol DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    console.error('Error listando roles:', e.message);
    res.status(500).json({ success: false, message: 'Error listando roles' });
  }
});

app.get('/api/roles/:id', authenticateJWT, checkModuleAccess('ROLES'), async (req, res) => {
  try {
    const { id } = req.params;
    const rol = await pool.query('SELECT * FROM roles WHERE id_rol = $1', [id]);
    if (rol.rows.length === 0) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    const permisos = await pool.query(`
      SELECT p.id_permiso, p.nombre
      FROM permisos p
      JOIN ver_detalle_rol vdr ON p.id_permiso = vdr.id_permiso
      WHERE vdr.id_rol = $1
    `, [id]);
    res.json({ success: true, data: { ...rol.rows[0], permisos: permisos.rows } });
  } catch (e) {
    console.error('Error obteniendo rol:', e.message);
    res.status(500).json({ success: false, message: 'Error obteniendo rol' });
  }
});

app.post('/api/roles', authenticateJWT, checkModuleAccess('ROLES'), async (req, res) => {
  try {
    const { nombre_rol, descripcion, estado = 1, permisos = [] } = req.body;
    if (!nombre_rol) return res.status(400).json({ success: false, message: 'Nombre del rol requerido' });
    const existe = await pool.query('SELECT id_rol FROM roles WHERE LOWER(nombre_rol) = LOWER($1)', [nombre_rol]);
    if (existe.rows.length > 0) return res.status(400).json({ success: false, message: 'El rol ya existe' });
    const result = await pool.query(
      'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES ($1, $2, $3) RETURNING *',
      [nombre_rol, descripcion, estado]
    );
    const newId = result.rows[0].id_rol;
    const permisosConDashboard = [...new Set([...permisos, 9])];
    for (const pid of permisosConDashboard) {
      await pool.query('INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)', [newId, pid]);
    }
    res.status(201).json({ success: true, message: 'Rol creado exitosamente', data: result.rows[0] });
  } catch (e) {
    console.error('Error creando rol:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un rol con ese nombre' : 'Error al crear el rol';
    res.status(500).json({ success: false, message: msg });
  }
});

app.put('/api/roles/:id', authenticateJWT, checkModuleAccess('ROLES'), async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === 1) return res.status(400).json({ success: false, message: 'No se puede modificar el rol administrador' });
    const { nombre_rol, descripcion, estado, permisos } = req.body;
    const result = await pool.query(
      'UPDATE roles SET nombre_rol=$1, descripcion=$2, estado=$3 WHERE id_rol=$4 RETURNING *',
      [nombre_rol, descripcion, estado, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    if (permisos && permisos.length > 0) {
      await pool.query('DELETE FROM ver_detalle_rol WHERE id_rol = $1', [id]);
      const permisosConDashboard = [...new Set([...permisos, 9])];
      for (const pid of permisosConDashboard) {
        await pool.query('INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES ($1, $2)', [id, pid]);
      }
    }
    res.json({ success: true, message: 'Rol actualizado', data: result.rows[0] });
  } catch (e) {
    console.error('Error actualizando rol:', e.message);
    res.status(500).json({ success: false, message: 'Error actualizando rol' });
  }
});

app.patch('/api/roles/:id/estado', authenticateJWT, checkModuleAccess('ROLES'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (parseInt(id) === 1) return res.status(400).json({ success: false, message: 'No se puede desactivar el rol administrador' });
    if (estado === 0 || estado === '0') {
      const usuarios = await pool.query('SELECT COUNT(*) as c FROM usuarios WHERE id_rol=$1 AND estado=1', [id]);
      if (parseInt(usuarios.rows[0].c) > 0) {
        return res.status(400).json({ success: false, message: 'No se puede desactivar: hay usuarios activos con este rol' });
      }
    }
    const result = await pool.query('UPDATE roles SET estado=$1 WHERE id_rol=$2 RETURNING *', [estado, id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    res.json({ success: true, message: `Rol ${estado == 1 ? 'activado' : 'desactivado'} exitosamente`, data: result.rows[0] });
  } catch (e) {
    console.error('Error cambiando estado de rol:', e.message);
    res.status(500).json({ success: false, message: 'Error cambiando estado de rol' });
  }
});

app.delete('/api/roles/:id', authenticateJWT, checkModuleAccess('ROLES'), async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === 1) return res.status(400).json({ success: false, message: 'No se puede eliminar el rol administrador' });
    const usuarios = await pool.query('SELECT COUNT(*) as c FROM usuarios WHERE id_rol=$1 AND estado=1', [id]);
    if (parseInt(usuarios.rows[0].c) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: hay usuarios activos con este rol' });
    }
    await pool.query('DELETE FROM ver_detalle_rol WHERE id_rol=$1', [id]);
    const result = await pool.query('DELETE FROM roles WHERE id_rol=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    res.json({ success: true, message: 'Rol eliminado exitosamente' });
  } catch (e) {
    console.error('Error eliminando rol:', e.message);
    res.status(500).json({ success: false, message: 'Error eliminando rol' });
  }
});

// ════════════════════════════════════════════════════════════
//  USUARIOS
// ════════════════════════════════════════════════════════════

app.get('/api/usuarios', authenticateJWT, checkModuleAccess('USUARIOS'), async (req, res) => {
  try {
    const { search, estado, id_rol } = req.query;
    let query = `
      SELECT u.*, r.nombre_rol
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      WHERE 1=1
    `;
    const params = []; let n = 1;
    if (search) {
      query += ` AND (u.nombre_completo ILIKE $${n} OR u.email ILIKE $${n} OR u.usuario ILIKE $${n} OR u.document_number ILIKE $${n})`;
      params.push(`%${search}%`); n++;
    }
    if (estado !== undefined) { query += ` AND u.estado=$${n}`; params.push(parseInt(estado)); n++; }
    if (id_rol) { query += ` AND u.id_rol=$${n}`; params.push(parseInt(id_rol)); n++; }
    query += ' ORDER BY u.id_usuario DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    console.error('Error listando usuarios:', e.message);
    res.status(500).json({ success: false, message: 'Error listando usuarios' });
  }
});

app.get('/api/usuarios/:id', authenticateJWT, checkModuleAccess('USUARIOS'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.*, r.nombre_rol FROM usuarios u LEFT JOIN roles r ON u.id_rol=r.id_rol WHERE u.id_usuario=$1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    console.error('Error obteniendo usuario:', e.message);
    res.status(500).json({ success: false, message: 'Error obteniendo usuario' });
  }
});

app.post('/api/usuarios', authenticateJWT, checkModuleAccess('USUARIOS'), async (req, res) => {
  try {
    const { id_rol, nombre_completo, email, usuario, contrasena, document_type = 'CC', document_number } = req.body;
    if (!id_rol || !nombre_completo || !email || !usuario || !contrasena || !document_number) {
      return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }
    const emailEx = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(email)=LOWER($1)', [email]);
    if (emailEx.rows.length > 0) return res.status(400).json({ success: false, message: 'El email ya está registrado' });
    const userEx = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(usuario)=LOWER($1)', [usuario]);
    if (userEx.rows.length > 0) return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso' });
    const docEx = await pool.query('SELECT id_usuario FROM usuarios WHERE document_type=$1 AND document_number=$2', [document_type, document_number]);
    if (docEx.rows.length > 0) return res.status(400).json({ success: false, message: 'El número de documento ya está registrado' });
    const hash = await bcrypt.hash(contrasena, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contrasena, estado, document_type, document_number)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
       RETURNING *`,
      [id_rol, nombre_completo, email, usuario, hash, document_type, document_number]
    );
    res.status(201).json({
      success: true,
      message: 'Usuario creado. Esperando activación del administrador.',
      data: result.rows[0]
    });
  } catch (e) {
    console.error('Error creando usuario:', e.message);
    const msg = e.message?.includes('duplicate') || e.message?.includes('unique') ? 'El email o usuario ya está registrado' : 'Error al crear el usuario';
    res.status(500).json({ success: false, message: msg });
  }
});

app.put('/api/usuarios/:id', authenticateJWT, checkModuleAccess('USUARIOS'), async (req, res) => {
  try {
    const { id } = req.params;
    const { id_rol, nombre_completo, email, usuario, contrasena, document_type, document_number } = req.body;
    const updates = []; const params = []; let n = 1;
    if (id_rol !== undefined) { updates.push(`id_rol=$${n}`); params.push(id_rol); n++; }
    if (nombre_completo !== undefined) { updates.push(`nombre_completo=$${n}`); params.push(nombre_completo); n++; }
    if (email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Email inválido' });
      updates.push(`email=$${n}`); params.push(email); n++;
    }
    if (usuario !== undefined) { updates.push(`usuario=$${n}`); params.push(usuario); n++; }
    if (document_type !== undefined) { updates.push(`document_type=$${n}`); params.push(document_type); n++; }
    if (document_number !== undefined) { updates.push(`document_number=$${n}`); params.push(document_number); n++; }
    if (contrasena) {
      const hash = await bcrypt.hash(contrasena, 10);
      updates.push(`contrasena=$${n}`); params.push(hash); n++;
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'Nada que actualizar' });
    params.push(id);
    const result = await pool.query(
      `UPDATE usuarios SET ${updates.join(',')} WHERE id_usuario=$${n} RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, message: 'Usuario actualizado exitosamente', data: result.rows[0] });
  } catch (e) {
    console.error('Error actualizando usuario:', e.message);
    res.status(500).json({ success: false, message: 'Error actualizando usuario' });
  }
});

app.patch('/api/usuarios/:id/estado', authenticateJWT, checkModuleAccess('USUARIOS'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (parseInt(id) === 1) return res.status(400).json({ success: false, message: 'No se puede desactivar al administrador principal' });
    const result = await pool.query('UPDATE usuarios SET estado=$1 WHERE id_usuario=$2 RETURNING *', [estado, id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, message: `Usuario ${estado == 1 ? 'activado' : 'desactivado'}`, data: result.rows[0] });
  } catch (e) {
    console.error('Error cambiando estado de usuario:', e.message);
    res.status(500).json({ success: false, message: 'Error cambiando estado de usuario' });
  }
});

app.delete('/api/usuarios/:id', authenticateJWT, checkModuleAccess('USUARIOS'), async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === 1) return res.status(400).json({ success: false, message: 'No se puede eliminar al administrador principal' });
    if (parseInt(id) === req.user.id_usuario) return res.status(400).json({ success: false, message: 'No puedes eliminarte a ti mismo' });
    const result = await pool.query('DELETE FROM usuarios WHERE id_usuario=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, message: 'Usuario eliminado exitosamente' });
  } catch (e) {
    console.error('Error eliminando usuario:', e.message);
    res.status(500).json({ success: false, message: 'Error eliminando usuario' });
  }
});

// ════════════════════════════════════════════════════════════
//  CATEGORÍAS
// ════════════════════════════════════════════════════════════

app.get('/api/categorias', authenticateJWT, checkModuleAccess('CATEGORIAS'), async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM categorias WHERE 1=1';
    const params = []; let n = 1;
    if (search) { query += ` AND (nombre ILIKE $${n} OR descripcion ILIKE $${n})`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND estado=$${n}`; params.push(parseInt(estado)); n++; }
    query += ' ORDER BY id_categoria DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    console.error('Error listando categorías:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error listando categorías';
    res.status(500).json({ success: false, message: msg });
  }
});

app.get('/api/categorias/:id', authenticateJWT, checkModuleAccess('CATEGORIAS'), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM categorias WHERE id_categoria=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    console.error('Error obteniendo categoría:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error obteniendo categoría';
    res.status(500).json({ success: false, message: msg });
  }
});

app.post('/api/categorias', authenticateJWT, checkModuleAccess('CATEGORIAS'), async (req, res) => {
  try {
    const { nombre, descripcion, estado = 1 } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
    const r = await pool.query(
      'INSERT INTO categorias (nombre,descripcion,estado) VALUES ($1,$2,$3) RETURNING *',
      [nombre, descripcion, estado]
    );
    res.status(201).json({ success: true, message: 'Categoría creada', data: r.rows[0] });
  } catch (e) {
    console.error('Error creando categoría:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error creando categoría';
    res.status(500).json({ success: false, message: msg });
  }
});

app.put('/api/categorias/:id', authenticateJWT, checkModuleAccess('CATEGORIAS'), async (req, res) => {
  try {
    const { nombre, descripcion, estado } = req.body;
    const r = await pool.query(
      'UPDATE categorias SET nombre=$1,descripcion=$2,estado=$3 WHERE id_categoria=$4 RETURNING *',
      [nombre, descripcion, estado, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    res.json({ success: true, message: 'Categoría actualizada', data: r.rows[0] });
  } catch (e) {
    console.error('Error actualizando categoría:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error actualizando categoría';
    res.status(500).json({ success: false, message: msg });
  }
});

app.patch('/api/categorias/:id/estado', authenticateJWT, checkModuleAccess('CATEGORIAS'), async (req, res) => {
  try {
    const { estado } = req.body;
    if (estado === 0 || estado === '0') {
      const prods = await pool.query('SELECT COUNT(*) as c FROM productos WHERE id_categoria=$1 AND estado=1', [req.params.id]);
      if (parseInt(prods.rows[0].c) > 0) {
        return res.status(400).json({ success: false, message: 'No se puede desactivar: tiene productos activos asociados' });
      }
    }
    const r = await pool.query('UPDATE categorias SET estado=$1 WHERE id_categoria=$2 RETURNING *', [estado, req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    res.json({ success: true, message: `Categoría ${estado == 1 ? 'activada' : 'desactivada'}`, data: r.rows[0] });
  } catch (e) {
    console.error('Error cambiando estado de categoría:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error cambiando estado';
    res.status(500).json({ success: false, message: msg });
  }
});

app.delete('/api/categorias/:id', authenticateJWT, checkModuleAccess('CATEGORIAS'), async (req, res) => {
  try {
    const prods = await pool.query('SELECT COUNT(*) as c FROM productos WHERE id_categoria=$1 AND estado=1', [req.params.id]);
    if (parseInt(prods.rows[0].c) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: tiene productos activos asociados' });
    }
    const r = await pool.query('DELETE FROM categorias WHERE id_categoria=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    res.json({ success: true, message: 'Categoría eliminada' });
  } catch (e) {
    console.error('Error eliminando categoría:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error eliminando categoría';
    res.status(500).json({ success: false, message: msg });
  }
});

// ════════════════════════════════════════════════════════════
//  📦 PRODUCTOS 
// ════════════════════════════════════════════════════════════

app.get('/api/productos', authenticateJWT, checkModuleAccess('PRODUCTOS'), async (req, res) => {
  try {
    const { search, estado, id_categoria } = req.query;
    let query = `
      SELECT p.*, c.nombre as nombre_categoria,
      CASE WHEN p.stock = 0 THEN 'Agotado'
           WHEN p.stock <= p.stock_minimo THEN 'Bajo stock'
           ELSE 'Suficiente' END as estado_stock
      FROM productos p 
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria 
      WHERE 1=1
    `;
    const params = []; let n = 1;
    
    if (search) { query += ` AND (p.nombre ILIKE $${n})`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND p.estado=$${n}`; params.push(parseInt(estado)); n++; }
    if (id_categoria) { query += ` AND p.id_categoria=$${n}`; params.push(parseInt(id_categoria)); n++; }
    
    query += ' ORDER BY p.id_producto DESC';
    const result = await pool.query(query, params);
    
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    console.error('Error listando productos:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
            : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
            : 'Error listando productos';
    res.status(500).json({ success: false, message: msg });
  }
});

app.get('/api/productos/:id', authenticateJWT, checkModuleAccess('PRODUCTOS'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT p.*, c.nombre as nombre_categoria FROM productos p LEFT JOIN categorias c ON p.id_categoria=c.id_categoria WHERE p.id_producto=$1',
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    console.error('Error obteniendo producto:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
            : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
            : 'Error obteniendo producto';
    res.status(500).json({ success: false, message: msg });
  }
});

app.post('/api/productos', authenticateJWT, checkModuleAccess('PRODUCTOS'), async (req, res) => {
  try {
    const { 
      nombre, 
      id_categoria, 
      precio_compra, 
      precio_venta, 
      stock = 0, 
      stock_minimo = 0, 
      unidades_por_paquete = 1, 
      estado = 1 
    } = req.body;
    
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    }
    if (!id_categoria) {
      return res.status(400).json({ success: false, message: 'La categoría es requerida' });
    }
    if (precio_venta === undefined || precio_venta === null || isNaN(parseFloat(precio_venta)) || parseFloat(precio_venta) <= 0) {
      return res.status(400).json({ success: false, message: 'El precio de venta es requerido y debe ser mayor a 0' });
    }
    
    const precioCompraValido = (precio_compra !== undefined && precio_compra !== null && !isNaN(parseFloat(precio_compra)) && parseFloat(precio_compra) >= 0) 
      ? parseFloat(precio_compra) 
      : 0;
    
    const r = await pool.query(
      `INSERT INTO productos (
        nombre, id_categoria, precio_compra, precio_venta, 
        stock, stock_minimo, unidades_por_paquete, estado
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        nombre.trim(), 
        parseInt(id_categoria), 
        precioCompraValido, 
        parseFloat(precio_venta), 
        parseInt(stock) || 0, 
        parseInt(stock_minimo) || 0, 
        parseInt(unidades_por_paquete) || 1, 
        estado
      ]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Producto registrado en catálogo. El stock y precio de compra se actualizarán al registrar una compra.', 
      data: r.rows[0] 
    });
    
  } catch (e) {
    console.error('Error creando producto:', e.message);
    let msg = 'Error al crear el producto';
    if (e.message?.includes('duplicate') || e.message?.includes('unique')) {
      msg = 'Ya existe un producto con ese nombre en esta categoría';
    } else if (e.message?.includes('foreign key')) {
      msg = 'La categoría seleccionada no existe';
    }
    res.status(500).json({ success: false, message: msg });
  }
});

app.put('/api/productos/:id', authenticateJWT, checkModuleAccess('PRODUCTOS'), async (req, res) => {
  try {
    const { 
      nombre, 
      id_categoria, 
      precio_compra, 
      precio_venta, 
      stock, 
      stock_minimo, 
      unidades_por_paquete, 
      estado 
    } = req.body;
    
    const r = await pool.query(
      `UPDATE productos SET 
        nombre=$1, id_categoria=$2, precio_compra=$3, precio_venta=$4, 
        stock=$5, stock_minimo=$6, unidades_por_paquete=$7, estado=$8 
       WHERE id_producto=$9 RETURNING *`,
      [nombre, id_categoria, precio_compra, precio_venta, stock, stock_minimo, unidades_por_paquete, estado, req.params.id]
    );
    
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, message: 'Producto actualizado', data: r.rows[0] });
  } catch (e) {
    console.error('Error actualizando producto:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
            : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
            : 'Error actualizando producto';
    res.status(500).json({ success: false, message: msg });
  }
});

app.patch('/api/productos/:id/estado', authenticateJWT, checkModuleAccess('PRODUCTOS'), async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE productos SET estado=$1 WHERE id_producto=$2 RETURNING *', 
      [req.body.estado, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, message: `Producto ${req.body.estado == 1 ? 'activado' : 'desactivado'}`, data: r.rows[0] });
  } catch (e) {
    console.error('Error cambiando estado de producto:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
            : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
            : 'Error cambiando estado';
    res.status(500).json({ success: false, message: msg });
  }
});

app.delete('/api/productos/:id', authenticateJWT, checkModuleAccess('PRODUCTOS'), async (req, res) => {
  try {
    const ventas = await pool.query('SELECT COUNT(*) as c FROM detalle_ventas WHERE id_producto=$1', [req.params.id]);
    if (parseInt(ventas.rows[0].c) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: tiene ventas asociadas. Desactívalo en su lugar.' });
    }
    const r = await pool.query('DELETE FROM productos WHERE id_producto=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json({ success: true, message: 'Producto eliminado' });
  } catch (e) {
    console.error('Error eliminando producto:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
            : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
            : 'Error eliminando producto';
    res.status(500).json({ success: false, message: msg });
  }
});

// ════════════════════════════════════════════════════════════
//  PROVEEDORES
// ════════════════════════════════════════════════════════════

app.get('/api/proveedores', authenticateJWT, checkModuleAccess('PROVEEDORES'), async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM proveedores WHERE 1=1';
    const params = []; let n = 1;
    if (search) { query += ` AND (nombre_razon_social ILIKE $${n} OR contacto ILIKE $${n} OR telefono ILIKE $${n} OR email ILIKE $${n})`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND estado=$${n}`; params.push(parseInt(estado)); n++; }
    query += ' ORDER BY id_proveedor DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    console.error('Error listando proveedores:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error listando proveedores';
    res.status(500).json({ success: false, message: msg });
  }
});

app.get('/api/proveedores/:id', authenticateJWT, checkModuleAccess('PROVEEDORES'), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM proveedores WHERE id_proveedor=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    console.error('Error obteniendo proveedor:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error obteniendo proveedor';
    res.status(500).json({ success: false, message: msg });
  }
});

app.post('/api/proveedores', authenticateJWT, checkModuleAccess('PROVEEDORES'), async (req, res) => {
  try {
    const { nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado = 1, tipo } = req.body;
    if (!nombre_razon_social || !telefono) return res.status(400).json({ success: false, message: 'Nombre y teléfono son requeridos' });
    const r = await pool.query(
      'INSERT INTO proveedores (nombre_razon_social,tipo_documento,documento,contacto,telefono,email,direccion,estado,tipo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, tipo]
    );
    res.status(201).json({ success: true, message: 'Proveedor creado', data: r.rows[0] });
  } catch (e) {
    console.error('Error creando proveedor:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error creando proveedor';
    res.status(500).json({ success: false, message: msg });
  }
});

app.put('/api/proveedores/:id', authenticateJWT, checkModuleAccess('PROVEEDORES'), async (req, res) => {
  try {
    const { nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, tipo } = req.body;
    const r = await pool.query(
      'UPDATE proveedores SET nombre_razon_social=$1,tipo_documento=$2,documento=$3,contacto=$4,telefono=$5,email=$6,direccion=$7,estado=$8,tipo=$9 WHERE id_proveedor=$10 RETURNING *',
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado, tipo, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, message: 'Proveedor actualizado', data: r.rows[0] });
  } catch (e) {
    console.error('Error actualizando proveedor:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error actualizando proveedor';
    res.status(500).json({ success: false, message: msg });
  }
});

app.patch('/api/proveedores/:id/estado', authenticateJWT, checkModuleAccess('PROVEEDORES'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
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
    console.error('Error cambiando estado de proveedor:', e.message);
    res.status(500).json({ success: false, message: 'Error al cambiar estado del proveedor' });
  }
});

app.delete('/api/proveedores/:id', authenticateJWT, checkModuleAccess('PROVEEDORES'), async (req, res) => {
  try {
    const compras = await pool.query('SELECT COUNT(*) as c FROM compras WHERE id_proveedor=$1', [req.params.id]);
    if (parseInt(compras.rows[0].c) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: tiene compras asociadas' });
    }
    const r = await pool.query('DELETE FROM proveedores WHERE id_proveedor=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, message: 'Proveedor eliminado' });
  } catch (e) {
    console.error('Error eliminando proveedor:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error eliminando proveedor';
    res.status(500).json({ success: false, message: msg });
  }
});

// ════════════════════════════════════════════════════════════
//  CLIENTES
// ════════════════════════════════════════════════════════════

app.get('/api/clientes', authenticateJWT, checkModuleAccess('CLIENTES'), async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM clientes WHERE 1=1';
    const params = []; let n = 1;
    if (search) { query += ` AND (nombre ILIKE $${n} OR telefono ILIKE $${n} OR documento ILIKE $${n})`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND estado=$${n}`; params.push(estado.toString()); n++; }
    query += ' ORDER BY id_cliente DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    console.error('Error listando clientes:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error listando clientes';
    res.status(500).json({ success: false, message: msg });
  }
});

app.get('/api/clientes/:id', authenticateJWT, checkModuleAccess('CLIENTES'), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM clientes WHERE id_cliente=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    console.error('Error obteniendo cliente:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error obteniendo cliente';
    res.status(500).json({ success: false, message: msg });
  }
});

app.post('/api/clientes', authenticateJWT, checkModuleAccess('CLIENTES'), async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion, estado = 1 } = req.body;
    if (!nombre || !telefono) return res.status(400).json({ success: false, message: 'Nombre y teléfono son requeridos' });
    const r = await pool.query(
      'INSERT INTO clientes (nombre,tipo_documento,documento,telefono,direccion,estado) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [nombre, tipo_documento, documento, telefono, direccion, estado]
    );
    res.status(201).json({ success: true, message: 'Cliente creado', data: r.rows[0] });
  } catch (e) {
    console.error('Error creando cliente:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error creando cliente';
    res.status(500).json({ success: false, message: msg });
  }
});

app.put('/api/clientes/:id', authenticateJWT, checkModuleAccess('CLIENTES'), async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion, estado } = req.body;
    const r = await pool.query(
      'UPDATE clientes SET nombre=$1,tipo_documento=$2,documento=$3,telefono=$4,direccion=$5,estado=$6 WHERE id_cliente=$7 RETURNING *',
      [nombre, tipo_documento, documento, telefono, direccion, estado, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, message: 'Cliente actualizado', data: r.rows[0] });
  } catch (e) {
    console.error('Error actualizando cliente:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error actualizando cliente';
    res.status(500).json({ success: false, message: msg });
  }
});

app.patch('/api/clientes/:id/estado', authenticateJWT, checkModuleAccess('CLIENTES'), async (req, res) => {
  try {
    const { estado } = req.body;
    if (estado === 0 || estado === '0') {
      const ventas = await pool.query('SELECT COUNT(*) as c FROM ventas WHERE id_cliente=$1 AND estado=1', [req.params.id]);
      if (parseInt(ventas.rows[0].c) > 0) {
        return res.status(400).json({ success: false, message: 'No se puede desactivar: tiene ventas activas asociadas' });
      }
    }
    const r = await pool.query('UPDATE clientes SET estado=$1 WHERE id_cliente=$2 RETURNING *', [estado, req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, message: `Cliente ${estado == 1 ? 'activado' : 'desactivado'}`, data: r.rows[0] });
  } catch (e) {
    console.error('Error cambiando estado de cliente:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error cambiando estado';
    res.status(500).json({ success: false, message: msg });
  }
});

app.delete('/api/clientes/:id', authenticateJWT, checkModuleAccess('CLIENTES'), async (req, res) => {
  try {
    const ventas = await pool.query('SELECT COUNT(*) as c FROM ventas WHERE id_cliente=$1', [req.params.id]);
    if (parseInt(ventas.rows[0].c) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar: tiene ventas asociadas' });
    }
    const r = await pool.query('DELETE FROM clientes WHERE id_cliente=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (e) {
    console.error('Error eliminando cliente:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error eliminando cliente';
    res.status(500).json({ success: false, message: msg });
  }
});

// ════════════════════════════════════════════════════════════
//  COMPRAS
// ════════════════════════════════════════════════════════════

app.get('/api/compras', authenticateJWT, checkModuleAccess('COMPRAS'), async (req, res) => {
  try {
    const { search, estado, id_proveedor } = req.query;
    let query = `
      SELECT c.*, p.nombre_razon_social as nombre_proveedor
      FROM compras c 
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor 
      WHERE 1=1
    `;
    const params = []; let n = 1;
    
    if (search) { query += ` AND p.nombre_razon_social ILIKE $${n}`; params.push(`%${search}%`); n++; }
    if (estado !== undefined && estado !== '') { query += ` AND c.estado = $${n}`; params.push(parseInt(estado)); n++; }
    else { query += ` AND c.estado IN (1, 2)`; }
    if (id_proveedor) { query += ` AND c.id_proveedor = $${n}`; params.push(parseInt(id_proveedor)); n++; }
    
    query += ' ORDER BY c.id_compra DESC';
    const result = await pool.query(query, params);
    
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    console.error('Error en GET /api/compras:', error.message);
    res.status(500).json({ success: false, message: 'Error al listar las compras' });
  }
});

app.get('/api/compras/:id', authenticateJWT, checkModuleAccess('COMPRAS'), async (req, res) => {
  try {
    const compra = await pool.query(`
      SELECT c.*, p.nombre_razon_social, p.telefono as proveedor_telefono
      FROM compras c LEFT JOIN proveedores p ON c.id_proveedor=p.id_proveedor WHERE c.id_compra=$1
    `, [req.params.id]);
    if (compra.rows.length === 0) return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    const detalles = await pool.query(`
      SELECT dc.*, pr.nombre as nombre_producto,
             (dc.cantidad * dc.unidades_por_paquete) as unidades_ingresadas
      FROM detalle_compras dc LEFT JOIN productos pr ON dc.id_producto=pr.id_producto
      WHERE dc.id_compra=$1
    `, [req.params.id]);
    res.json({ success: true, data: { ...compra.rows[0], detalles: detalles.rows } });
  } catch (e) {
    console.error('Error obteniendo compra:', e.message);
    res.status(500).json({ success: false, message: 'Error obteniendo compra' });
  }
});

app.post('/api/compras', authenticateJWT, checkModuleAccess('COMPRAS'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id_proveedor, numero_factura, productos } = req.body;
    
    if (!id_proveedor || !numero_factura || !productos || productos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Proveedor, factura y productos son requeridos' 
      });
    }

    const total = productos.reduce((s, p) => {
      const precio = parseFloat(p.precio) || 0;
      const cantidad = parseInt(p.cantidad) || 0;
      return s + (precio * cantidad);
    }, 0);

    await client.query('BEGIN');

    const compraResult = await client.query(
      `INSERT INTO compras (id_proveedor, numero_factura, fecha, total, estado) 
       VALUES ($1, $2, NOW(), $3, 1) RETURNING *`,
      [parseInt(id_proveedor), numero_factura, total]
    );
    const compra = compraResult.rows[0];

    for (const p of productos) {
      const idProducto = parseInt(p.id_producto);
      const cantidad = parseInt(p.cantidad) || 0;
      const unidadesPorPaquete = parseInt(p.unidades_por_paquete) || 1;
      const precio = parseFloat(p.precio) || 0;
      const subtotal = cantidad * precio;
      const unidadesTotales = cantidad * unidadesPorPaquete;

      const prodCheck = await client.query(
        'SELECT id_producto FROM productos WHERE id_producto = $1 AND estado = 1',
        [idProducto]
      );
      
      if (prodCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `El producto con ID ${idProducto} no existe o está inactivo` 
        });
      }

      await client.query(
        `INSERT INTO detalle_compras 
         (id_compra, id_producto, cantidad, precio, subtotal, unidades_por_paquete) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [compra.id_compra, idProducto, cantidad, precio, subtotal, unidadesPorPaquete]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ 
      success: true, 
      message: 'Compra registrada en estado PENDIENTE. El stock se actualizará cuando marque como Recibida.', 
      data: compra 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando compra:', error.message);
    
    let msg = 'Error al registrar la compra';
    if (error.message?.includes('detalle_compras')) {
      msg = 'Error en detalle de compras. Verifica la estructura de la tabla';
    } else if (error.message?.includes('foreign key')) {
      msg = 'Uno de los productos o proveedor no existe';
    }
    
    res.status(500).json({ 
      success: false, 
      message: msg,
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
    
  } finally {
    client.release();
  }
});

app.patch('/api/compras/:id/estado', authenticateJWT, checkModuleAccess('COMPRAS'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { estado } = req.body; 

    const compraActual = await client.query(
      'SELECT * FROM compras WHERE id_compra = $1',
      [id]
    );
    
    if (compraActual.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Compra no encontrada' 
      });
    }

    const estadoAnterior = parseInt(compraActual.rows[0].estado);
    const estadoNuevo = parseInt(estado);

    if (estadoAnterior === 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se puede modificar una compra anulada' 
      });
    }

    await client.query('BEGIN');

    const detalleCompra = await client.query(
      `SELECT dc.*, p.stock as stock_actual 
       FROM detalle_compras dc 
       JOIN productos p ON dc.id_producto = p.id_producto 
       WHERE dc.id_compra = $1`,
      [id]
    );

    for (const item of detalleCompra.rows) {
      const unidadesTotales = item.cantidad * (item.unidades_por_paquete || 1);
      const idProducto = item.id_producto;

      if (estadoAnterior === 1 && estadoNuevo === 2) {
        await client.query(
          `UPDATE productos 
           SET stock = COALESCE(stock, 0) + $1,
               precio_compra = $2
           WHERE id_producto = $3`,
          [unidadesTotales, item.precio, idProducto]
        );
      }

      if (estadoAnterior === 2 && estadoNuevo === 3) {
        await client.query(
          `UPDATE productos 
           SET stock = COALESCE(stock, 0) - $1
           WHERE id_producto = $2`,
          [unidadesTotales, idProducto]
        );
      }

      if (estadoAnterior === 3 && estadoNuevo === 2) {
        await client.query(
          `UPDATE productos 
           SET stock = COALESCE(stock, 0) + $1,
               precio_compra = $2
           WHERE id_producto = $3`,
          [unidadesTotales, item.precio, idProducto]
        );
      }

      if (estadoAnterior === 2 && estadoNuevo === 1) {
        await client.query(
          `UPDATE productos 
           SET stock = COALESCE(stock, 0) - $1
           WHERE id_producto = $2`,
          [unidadesTotales, idProducto]
        );
      }
    }

    await client.query(
      'UPDATE compras SET estado = $1 WHERE id_compra = $2',
      [estadoNuevo, id]
    );

    await client.query('COMMIT');

    const estadoNombre = estadoNuevo === 1 ? 'Pendiente' : estadoNuevo === 2 ? 'Recibida' : 'Anulada';
    res.json({ 
      success: true, 
      message: `Compra actualizada a estado: ${estadoNombre}`, 
      data: { id_compra: id, estado: estadoNuevo }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cambiando estado de compra:', error.message);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error al actualizar el estado de la compra',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
    
  } finally {
    client.release();
  }
});

app.delete('/api/compras/:id', authenticateJWT, (_req, res) => {
  res.status(405).json({ success: false, message: 'Las compras no se pueden eliminar. Usa la opción de anular.' });
});

// ════════════════════════════════════════════════════════════
//  VENTAS
// ════════════════════════════════════════════════════════════

app.get('/api/ventas', authenticateJWT, checkModuleAccess('VENTAS'), async (req, res) => {
  try {
    const { search, estado, id_cliente } = req.query;
    let query = `
      SELECT v.*, c.nombre as nombre_cliente
      FROM ventas v LEFT JOIN clientes c ON v.id_cliente=c.id_cliente WHERE 1=1`;
    const params = []; let n = 1;
    if (search) { query += ` AND c.nombre ILIKE $${n}`; params.push(`%${search}%`); n++; }
    if (estado !== undefined) { query += ` AND v.estado=$${n}`; params.push(parseInt(estado)); n++; }
    if (id_cliente) { query += ` AND v.id_cliente=$${n}`; params.push(parseInt(id_cliente)); n++; }
    query += ' ORDER BY v.id_venta DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) {
    console.error('Error listando ventas:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error listando ventas';
    res.status(500).json({ success: false, message: msg });
  }
});

app.get('/api/ventas/:id', authenticateJWT, checkModuleAccess('VENTAS'), async (req, res) => {
  try {
    const venta = await pool.query(`
      SELECT v.*, c.nombre, c.telefono as cliente_telefono
      FROM ventas v LEFT JOIN clientes c ON v.id_cliente=c.id_cliente WHERE v.id_venta=$1
    `, [req.params.id]);
    if (venta.rows.length === 0) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    const detalles = await pool.query(`
      SELECT dv.*, pr.nombre as nombre_producto
      FROM detalle_ventas dv LEFT JOIN productos pr ON dv.id_producto=pr.id_producto WHERE dv.id_venta=$1
    `, [req.params.id]);
    res.json({ success: true, data: { ...venta.rows[0], detalles: detalles.rows } });
  } catch (e) {
    console.error('Error obteniendo venta:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error obteniendo venta';
    res.status(500).json({ success: false, message: msg });
  }
});

app.post('/api/ventas', authenticateJWT, checkModuleAccess('VENTAS'), async (req, res) => {
  try {
    const { id_cliente, productos } = req.body;
    if (!id_cliente || !productos || productos.length === 0) {
      return res.status(400).json({ success: false, message: 'Cliente y productos son requeridos' });
    }
    for (const p of productos) {
      const stockR = await pool.query('SELECT stock, nombre FROM productos WHERE id_producto=$1 AND estado=1', [p.id_producto]);
      if (stockR.rows.length === 0) return res.status(400).json({ success: false, message: 'Producto no encontrado o inactivo' });
      if (parseInt(stockR.rows[0].stock) < p.cantidad) {
        return res.status(400).json({ success: false, message: `Stock insuficiente para: ${stockR.rows[0].nombre}` });
      }
    }
    const total = productos.reduce((s, p) => s + (p.precio * p.cantidad), 0);
    const ventaResult = await pool.query(
      'INSERT INTO ventas (id_cliente, fecha, total, estado) VALUES ($1, NOW(), $2, 1) RETURNING *',
      [id_cliente, total]
    );
    const venta = ventaResult.rows[0];
    for (const p of productos) {
      await pool.query(
        'INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) VALUES ($1,$2,$3,$4,$5)',
        [venta.id_venta, p.id_producto, p.cantidad, p.precio, p.subtotal]
      );
      await pool.query('UPDATE productos SET stock=stock-$1 WHERE id_producto=$2', [p.cantidad, p.id_producto]);
    }
    res.status(201).json({ success: true, message: 'Venta registrada exitosamente', data: venta });
  } catch (e) {
    console.error('Error creando venta:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error creando venta';
    res.status(500).json({ success: false, message: msg });
  }
});

app.patch('/api/ventas/:id/estado', authenticateJWT, checkModuleAccess('VENTAS'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const venta = await pool.query('SELECT * FROM ventas WHERE id_venta=$1', [id]);
    if (venta.rows.length === 0) return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    if (estado === 0 || estado === '0') {
      const detalles = await pool.query('SELECT * FROM detalle_ventas WHERE id_venta=$1', [id]);
      for (const d of detalles.rows) {
        await pool.query('UPDATE productos SET stock=stock+$1 WHERE id_producto=$2', [d.cantidad, d.id_producto]);
      }
    }
    await pool.query('UPDATE ventas SET estado=$1 WHERE id_venta=$2', [estado, id]);
    res.json({ success: true, message: 'Estado actualizado' });
  } catch (e) {
    console.error('Error actualizando estado de venta:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error actualizando estado';
    res.status(500).json({ success: false, message: msg });
  }
});

app.delete('/api/ventas/:id', authenticateJWT, (_req, res) => {
  res.status(405).json({ success: false, message: 'Las ventas no se pueden eliminar. Usa la opción de anular.' });
});

// ════════════════════════════════════════════════════════════
//  PERMISOS
// ════════════════════════════════════════════════════════════

app.get('/api/permisos', authenticateJWT, checkModuleAccess('ROLES'), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM permisos ORDER BY nombre');
    res.json({ success: true, data: r.rows });
  } catch (e) {
    console.error('Error obteniendo permisos:', e.message);
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' : 'Error obteniendo permisos';
    res.status(500).json({ success: false, message: msg });
  }
});

// ════════════════════════════════════════════════════════════
//  DASHBOARD - ESTADÍSTICAS Y REPORTES
// ════════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', authenticateJWT, checkModuleAccess('DASHBOARD'), async (req, res) => {
  try {
    const ventasMes = await pool.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM ventas 
      WHERE estado = 1
        AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
    `);
    
    const comprasMes = await pool.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM compras 
      WHERE estado = 2
        AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
    `);
    
    const [productos, clientes, proveedores, bajoStock, agotados] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM productos WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM clientes WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM proveedores WHERE estado = 1"),
      pool.query("SELECT COUNT(*) as c FROM productos WHERE stock <= stock_minimo AND estado = 1 AND stock > 0"),
      pool.query("SELECT COUNT(*) as c FROM productos WHERE stock = 0 AND estado = 1")
    ]);
    
    res.json({
      success: true,
      data: {
        totalProductos: parseInt(productos.rows[0].c),
        totalClientes: parseInt(clientes.rows[0].c),
        totalProveedores: parseInt(proveedores.rows[0].c),
        productosBajoStock: parseInt(bajoStock.rows[0].c),
        productosAgotados: parseInt(agotados.rows[0].c),
        ventasMes: parseFloat(ventasMes.rows[0].total),
        comprasMes: parseFloat(comprasMes.rows[0].total),
        balanceMes: parseFloat(ventasMes.rows[0].total) - parseFloat(comprasMes.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Error en /api/dashboard/stats:', error.message);
    res.status(500).json({ success: false, message: 'Error obteniendo estadísticas' });
  }
});

app.get('/api/dashboard/ventas-chart', authenticateJWT, checkModuleAccess('DASHBOARD'), async (req, res) => {
  try {
    const { periodo = 'semana' } = req.query;
    let query = '';
    if (periodo === 'semana') {
      query = `
        SELECT TRIM(TO_CHAR(fecha, 'Day')) as label,
               COALESCE(SUM(total), 0) as value
        FROM ventas
        WHERE fecha >= CURRENT_DATE - INTERVAL '7 days' AND estado = 1
        GROUP BY TRIM(TO_CHAR(fecha, 'Day')), EXTRACT(DOW FROM fecha)
        ORDER BY EXTRACT(DOW FROM fecha)
      `;
    } else if (periodo === 'mes') {
      query = `
        SELECT TO_CHAR(fecha, 'YYYY-MM-DD') as label,
               COALESCE(SUM(total), 0) as value
        FROM ventas
        WHERE fecha >= CURRENT_DATE - INTERVAL '30 days' AND estado = 1
        GROUP BY TO_CHAR(fecha, 'YYYY-MM-DD')
        ORDER BY label
      `;
    } else {
      query = `
        SELECT TRIM(TO_CHAR(fecha, 'Month')) as label,
               COALESCE(SUM(total), 0) as value
        FROM ventas
        WHERE fecha >= CURRENT_DATE - INTERVAL '1 year' AND estado = 1
        GROUP BY TRIM(TO_CHAR(fecha, 'Month')), EXTRACT(MONTH FROM fecha)
        ORDER BY EXTRACT(MONTH FROM fecha)
      `;
    }
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('Error dashboard chart:', e.message);
    res.status(500).json({ success: false, message: 'Error obteniendo gráfico' });
  }
});

app.get('/api/dashboard/reporte-financiero', authenticateJWT, checkModuleAccess('DASHBOARD'), async (req, res) => {
  try {
    const { tipo = 'mensual' } = req.query;
    let trunc = 'month';
    if (tipo === 'semanal') trunc = 'week';
    if (tipo === 'anual') trunc = 'year';
    
    const result = await pool.query(`
      SELECT DATE_TRUNC($1, fecha) as periodo,
             SUM(CASE WHEN tipo = 'venta' THEN total ELSE 0 END) as ingresos,
             SUM(CASE WHEN tipo = 'compra' THEN total ELSE 0 END) as egresos
      FROM (
        SELECT fecha, total, 'venta' as tipo 
        FROM ventas 
        WHERE estado = 1
        UNION ALL
        SELECT fecha, total, 'compra' as tipo 
        FROM compras 
        WHERE estado = 2
      ) t
      GROUP BY DATE_TRUNC($1, fecha)
      ORDER BY periodo DESC
      LIMIT 12
    `, [trunc]);
    
    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error('Error en reporte financiero:', e.message);
    res.status(500).json({ success: false, message: 'Error obteniendo reporte financiero' });
  }
});

// ============================================================
//  INICIAR SERVIDOR
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(30));
  console.log('🚀 API THE BAR v12.0');
  console.log('='.repeat(30));
  console.log(`Puerto: ${PORT}`);
});