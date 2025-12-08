const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// ✅ CONEXIÓN A LA BASE DE DATOS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://stockbar_user:0EndlOqYMUMDsuYAlnjyQ35Vzs3rFh1V@dpg-d4dmar9r0fns73eplq4g-a/stockbar_db',
  ssl: { rejectUnauthorized: false }
});

// CONFIGURACIÓN
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Configuración de email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'thebar752@gmail.com',
    pass: 'sfqj taqe yrmr zfhj' // Tu contraseña de aplicación
  }
});

// ==================== ENDPOINT RAÍZ ====================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ API STOCKBAR - VERSIÓN 7.0 (CON RECUPERACIÓN DE CONTRASEÑA)',
    version: '7.0.0',
    status: 'operacional',
    timestamp: new Date().toISOString(),
    endpoints: {
      public: {
        root: 'GET /',
        login: 'POST /api/login',
        'verify-email': 'POST /api/verify-email',
        'send-recovery-email': 'POST /api/send-recovery-email',
        'update-password': 'POST /api/update-password',
        test: 'GET /api/test',
        'check-db': 'GET /api/check-db'
      },
      protected: {
        ventas: 'GET /api/ventas (requiere token)',
        clientes: 'GET /api/clientes (requiere token)',
        productos: 'GET /api/productos (requiere token)',
        compras: 'GET /api/compras (requiere token)'
      }
    }
  });
});

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const authenticateToken = async (req, res, next) => {
  try {
    let token = req.headers['authorization'];
    
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token requerido' 
      });
    }
    
    // Decodificar token simple
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [userId] = decoded.split(':');
    
    // Buscar usuario (TABLA EN MINÚSCULAS)
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND estado = 1',
      [parseInt(userId)]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no válido' 
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

// ==================== VERIFICAR EMAIL (RECUPERACIÓN) ====================
app.post('/api/verify-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔍 Verificando email:', email);
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        exists: false,
        message: 'Email requerido' 
      });
    }
    
    // Buscar usuario por email
    const result = await pool.query(
      'SELECT id_usuario, email, nombre_completo FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Email no encontrado:', email);
      return res.json({
        success: true,
        exists: false,
        message: 'Email no registrado'
      });
    }
    
    console.log('✅ Email encontrado:', result.rows[0].email);
    
    res.json({
      success: true,
      exists: true,
      message: 'Email registrado en el sistema',
      data: {
        id_usuario: result.rows[0].id_usuario,
        email: result.rows[0].email,
        nombre_completo: result.rows[0].nombre_completo
      }
    });
    
  } catch (error) {
    console.error('💥 ERROR en verify-email:', error);
    res.status(500).json({ 
      success: false, 
      exists: false,
      message: 'Error del servidor' 
    });
  }
});

// ==================== ENVIAR EMAIL DE RECUPERACIÓN ====================
app.post('/api/send-recovery-email', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    
    console.log('📧 Enviando email de recuperación a:', email);
    
    if (!email || !codigo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y código requeridos' 
      });
    }
    
    // Verificar que el email existe
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
    
    const nombreUsuario = userResult.rows[0].nombre_completo || 'Usuario';
    
    // Configurar el email
    const mailOptions = {
      from: 'THE BAR Sistema <thebar752@gmail.com>',
      to: email,
      subject: 'Código de recuperación - THE BAR',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
                .header { background-color: #3B2E2A; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #F5EFE6; }
                .footer { background-color: #0F1A24; color: white; padding: 10px; text-align: center; }
                .codigo { background-color: #D99A00; color: #3B2E2A; padding: 15px; text-align: center; 
                         font-size: 28px; font-weight: bold; margin: 20px 0; border-radius: 8px; letter-spacing: 5px; }
                .nota { background-color: #D86633; color: white; padding: 10px; border-radius: 5px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>THE BAR</h1>
                <p>Sistema de Gestión</p>
            </div>
            <div class="content">
                <h2>Recuperación de Contraseña</h2>
                <p>Hola ${nombreUsuario},</p>
                <p>Hemos recibido una solicitud para restablecer tu contraseña en <strong>THE BAR Sistema</strong>.</p>
                <p>Tu código de verificación es:</p>
                <div class="codigo">${codigo}</div>
                <p>Ingresa este código en la aplicación para continuar con el proceso de recuperación.</p>
                
                <div class="nota">
                    <p><strong>⚠️ IMPORTANTE:</strong></p>
                    <p>• Este código es válido por <strong>30 segundos</strong></p>
                    <p>• Si no solicitaste este cambio, puedes ignorar este mensaje</p>
                    <p>• Tu contraseña actual permanecerá sin cambios</p>
                </div>
            </div>
            <div class="footer">
                <p>THE BAR Sistema © ${new Date().getFullYear()}</p>
                <p>Este es un mensaje automático, por favor no responder</p>
            </div>
        </body>
        </html>
      `
    };
    
    // Enviar el email
    await transporter.sendMail(mailOptions);
    
    console.log('✅ Email enviado exitosamente a:', email);
    
    res.json({
      success: true,
      message: '✅ Código enviado exitosamente',
      data: {
        email: email,
        codigo_enviado: true,
        timestamp: new Date().toISOString(),
        expira_en: '30 segundos'
      }
    });
    
  } catch (error) {
    console.error('💥 ERROR al enviar email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al enviar el código. Verifica que el email sea válido.' 
    });
  }
});

// ==================== ENVIAR EMAIL DE CONFIRMACIÓN ====================
app.post('/api/send-confirmation-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('📧 Enviando email de confirmación a:', email);
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email requerido' 
      });
    }
    
    // Verificar que el usuario existe
    const userResult = await pool.query(
      'SELECT nombre_completo FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const nombreUsuario = userResult.rows[0].nombre_completo || 'Usuario';
    
    // Configurar el email de confirmación
    const mailOptions = {
      from: 'THE BAR Sistema <thebar752@gmail.com>',
      to: email,
      subject: 'Contraseña actualizada exitosamente - THE BAR',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
                .header { background-color: #3B2E2A; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #F5EFE6; }
                .footer { background-color: #0F1A24; color: white; padding: 10px; text-align: center; }
                .exito { background-color: #2E7D32; color: white; padding: 15px; text-align: center; 
                        border-radius: 8px; margin: 20px 0; font-weight: bold; }
                .advertencia { background-color: #C62828; color: white; padding: 10px; border-radius: 5px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>THE BAR</h1>
                <p>Sistema de Gestión</p>
            </div>
            <div class="content">
                <h2>Contraseña Actualizada</h2>
                <p>Hola ${nombreUsuario},</p>
                <p>Tu contraseña en <strong>THE BAR Sistema</strong> ha sido cambiada exitosamente.</p>
                
                <div class="exito">
                    ✅ Cambio confirmado
                </div>
                
                <p>Ahora puedes iniciar sesión con tu nueva contraseña.</p>
                
                <div class="advertencia">
                    <p><strong>⚠️ SEGURIDAD:</strong></p>
                    <p>Si no realizaste este cambio, por favor:</p>
                    <p>1. Contacta inmediatamente al administrador</p>
                    <p>2. Cambia tu contraseña nuevamente</p>
                    <p>3. Revisa la seguridad de tu cuenta</p>
                </div>
                
                <p>Fecha y hora del cambio: ${new Date().toLocaleString('es-ES')}</p>
            </div>
            <div class="footer">
                <p>THE BAR Sistema © ${new Date().getFullYear()}</p>
                <p>Este es un mensaje automático, por favor no responder</p>
            </div>
        </body>
        </html>
      `
    };
    
    // Enviar el email
    await transporter.sendMail(mailOptions);
    
    console.log('✅ Email de confirmación enviado a:', email);
    
    res.json({
      success: true,
      message: '✅ Email de confirmación enviado',
      data: {
        email: email,
        confirmado: true,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('💥 ERROR al enviar email de confirmación:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al enviar email de confirmación' 
    });
  }
});

// ==================== ACTUALIZAR CONTRASEÑA ====================
app.post('/api/update-password', async (req, res) => {
  try {
    const { email, nuevaPassword } = req.body;
    
    console.log('🔄 Actualizando contraseña para:', email);
    
    if (!email || !nuevaPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y nueva contraseña requeridos' 
      });
    }
    
    if (nuevaPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'La contraseña debe tener al menos 6 caracteres' 
      });
    }
    
    // Verificar que el usuario existe
    const userResult = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    // Encriptar la nueva contraseña
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
    
    // Actualizar la contraseña
    await pool.query(
      'UPDATE usuarios SET contraseña = $1 WHERE email = $2',
      [hashedPassword, email]
    );
    
    console.log('✅ Contraseña actualizada para:', email);
    
    res.json({
      success: true,
      message: '✅ Contraseña actualizada exitosamente',
      data: {
        email: email,
        updated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('💥 ERROR en update-password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  }
});

// ==================== LOGIN - ENDPOINT PÚBLICO ====================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    // Buscar usuario (TABLA EN MINÚSCULAS)
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const user = result.rows[0];
    const dbPassword = user.contraseña || '';
    
    console.log('✅ Usuario encontrado:', user.email);
    
    // ✅ VERIFICACIÓN DE CONTRASEÑA
    let validPassword = false;
    
    // 1. Si las contraseñas son iguales directamente
    if (dbPassword === password) {
      validPassword = true;
      console.log('✅ Contraseña correcta (comparación directa)');
    }
    // 2. Si es hash bcrypt
    else if (dbPassword && dbPassword.startsWith('$2')) {
      try {
        validPassword = await bcrypt.compare(password, dbPassword);
        if (validPassword) {
          console.log('✅ Contraseña correcta (bcrypt)');
        }
      } catch (bcryptError) {
        console.log('⚠️ Error con bcrypt, intentando comparación directa...');
        validPassword = (dbPassword === password);
      }
    }
    // 3. Contraseña por defecto para desarrollo
    else if (password === 'admin123') {
      console.log('⚠️ Usando contraseña de desarrollo "admin123"');
      validPassword = true;
    }
    
    if (!validPassword) {
      console.log('❌ Contraseña incorrecta');
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }
    
    // ✅ GENERAR TOKEN
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
    // ✅ PREPARAR RESPUESTA DEL USUARIO
    const userResponse = {
      id_usuario: user.id_usuario,
      email: user.email,
      nombre_completo: user.nombre_completo || 'Administrador',
      usuario: user.usuario || 'admin',
      estado: user.estado || 1,
      id_rol: user.id_rol || 1
    };
    
    console.log('🎉 Login exitoso para:', email);
    
    res.json({
      success: true,
      message: '✅ Login exitoso',
      token: token,
      user: userResponse,
      expires_in: '30 días'
    });
    
  } catch (error) {
    console.error('💥 ERROR en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  }
});

// ==================== ENDPOINT DE PRUEBA ====================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ API funcionando correctamente',
    timestamp: new Date().toISOString(),
    database: 'Conectada a PostgreSQL (tablas en minúsculas)'
  });
});

// ... (EL RESTO DEL CÓDIGO DEL BACKEND SE MANTIENE IGUAL HASTA EL FINAL) ...

// ==================== INICIAR SERVIDOR ====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(70));
  console.log('🚀 API STOCKBAR - VERSIÓN 7.0');
  console.log('='.repeat(70));
  console.log('✅ CONFIGURADO PARA TABLAS EN MINÚSCULAS');
  console.log('✅ SISTEMA DE RECUPERACIÓN DE CONTRASEÑA ACTIVADO');
  console.log('='.repeat(70));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL local: http://localhost:${PORT}`);
  console.log(`🌍 URL pública: https://api-stockbar.onrender.com`);
  console.log('='.repeat(70));
  console.log('✅ Endpoints públicos:');
  console.log('   GET  /                       - Raíz de la API');
  console.log('   POST /api/login              - Autenticación');
  console.log('   POST /api/verify-email       - Verificar email');
  console.log('   POST /api/send-recovery-email - Enviar código (30s)');
  console.log('   POST /api/update-password    - Actualizar contraseña');
  console.log('   POST /api/send-confirmation-email - Confirmación');
  console.log('   GET  /api/test               - Prueba de conexión');
  console.log('   GET  /api/check-db           - Verificar base de datos');
  console.log('='.repeat(70));
  console.log('📧 Configuración de email:');
  console.log('   Email: thebar752@gmail.com');
  console.log('   SMTP: Gmail (con contraseña de aplicación)');
  console.log('='.repeat(70));
  console.log('🔐 Credenciales por defecto:');
  console.log('   Email: thebar752@gmail.com');
  console.log('   Password: admin123');
  console.log('='.repeat(70));
  console.log('✅ Servidor listo!');
  console.log('='.repeat(70));
});

// Manejo de cierre gracioso
process.on('SIGTERM', () => {
  console.log('🛑 Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    pool.end(() => {
      console.log('✅ Pool de PostgreSQL cerrado');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Recibida señal SIGINT, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    pool.end(() => {
      console.log('✅ Pool de PostgreSQL cerrado');
      process.exit(0);
    });
  });
});
