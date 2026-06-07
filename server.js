// ============================================================
//  THE BAR - API SERVER  v13.0.0  (ARQUITECTURA MODULAR)
//  Base de datos: Neon PostgreSQL
//  Autor: Nicole - Aprendiz SENA
//  Última actualización: Junio 2026
// ============================================================
const express    = require('express');
const cors       = require('cors');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ── Configuración modular ────────────────────────────────────
const pool = require('./config/database');        // Conexión DB centralizada
const transporter = require('./config/email');   // Email centralizado
const { JWT_SECRET } = require('./config/jwt');   // JWT centralizado

// ── Middlewares personalizados ───────────────────────────────
const authenticateJWT = require('./middlewares/authenticateJWT');
const checkModuleAccess = require('./middlewares/checkModuleAccess');

// ── App ─────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ──────────────────────────────────────
app.use(cors({ origin: '*' }));    
app.use(express.json());  

// ── Rutas modulares ─────────────────────────────────────────
app.use('/api/permisos', require('./routes/permisos.routes')); 
app.use('/api/roles', require('./routes/roles.routes'));
app.use('/api/usuarios', require('./routes/usuarios.routes'));
app.use('/api/categorias', require('./routes/categorias.routes')); 
app.use('/api/productos', require('./routes/productos.routes'));
app.use('/api/proveedores', require('./routes/proveedores.routes'));
app.use('/api/clientes', require('./routes/clientes.routes'));  
app.use('/api/compras', require('./routes/compras.routes'));  
app.use('/api/pedidos', require('./routes/pedidos.routes'));
app.use('/api/ventas', require('./routes/ventas.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));

// ============================================================
//  RAÍZ
// ============================================================
app.get('/', (_req, res) => {
  res.json({ success: true, message: 'API THE BAR v12.0', version: '12.1.0' });
});

// ============================================================
//  AUTH: LOGIN
// ============================================================
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
    console.error('ERROR login:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});

// ============================================================
//  AUTH: RECUPERAR CONTRASEÑA
// ============================================================
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
    console.error('Error forgot-password:', error);
    res.status(500).json({ success: false, message: 'Error al enviar el código', debug: error.message });
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
    console.error('Error verify-code:', error);
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
    console.error('Error reset-password:', error);
    res.status(500).json({ success: false, message: 'Error al cambiar contraseña' });
  }
});

// ============================================================
//  MENÚ DINÁMICO
// ============================================================
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
    console.error('Error menú:', error);
    res.status(500).json({ success: false, message: 'Error obteniendo menú' });
  }
});

// ============================================================
//  INICIAR SERVIDOR
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('API THE BAR v13.0');
  console.log('='.repeat(60));
  console.log(`Puerto: ${PORT}`);
  console.log('='.repeat(60));
});