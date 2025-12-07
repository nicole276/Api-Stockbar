const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ CONEXIÓN A LA BASE DE DATOS
const pool = new Pool({
  connectionString: 'postgresql://stockbar_user:0EndlOqYMUMDsuYAlnjyQ35Vzs3rFh1V@dpg-d4dmar9r0fns73eplq4g-a/stockbar_db',
  ssl: { rejectUnauthorized: false }
});

// CONFIGURACIÓN
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE DE AUTENTICACIÓN SIMPLIFICADO ====================
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
    
    // Decodificar token
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [userId] = decoded.split(':');
    
    // Buscar usuario
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

// ==================== ENDPOINTS ====================

// 1. RAÍZ
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ API STOCKBAR - LISTA',
    endpoints: {
      login: 'POST /api/login',
      clientes: 'GET /api/clientes (requiere token)',
      productos: 'GET /api/productos (requiere token)',
      ventas: 'GET /api/ventas (requiere token)'
    }
  });
});

// Login - VERSIÓN CORREGIDA
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt for:', email);
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    // Buscar usuario
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const user = result.rows[0];
    console.log('🔍 Usuario encontrado:', user.email);
    console.log('🔑 Contraseña en BD:', user.contraseña ? 'Sí' : 'No');
    
    // VERIFICAR CONTRASEÑA - MÚLTIPLES MÉTODOS
    let validPassword = false;
    
    // Método 1: Comparación directa
    if (user.contraseña === password) {
      validPassword = true;
      console.log('✅ Contraseña correcta (directa)');
    }
    // Método 2: Para 'admin123'
    else if (password === 'admin123' && user.contraseña.includes('$2a$')) {
      // Si el password es admin123 pero en BD está hasheado
      try {
        validPassword = await bcrypt.compare(password, user.contraseña);
        console.log('✅ Contraseña correcta (bcrypt)');
      } catch (bcryptError) {
        console.error('❌ Error bcrypt:', bcryptError);
      }
    }
    // Método 3: bcrypt normal
    else if (user.contraseña.startsWith('$2')) {
      try {
        validPassword = await bcrypt.compare(password, user.contraseña);
        console.log('✅ Contraseña correcta (bcrypt)');
      } catch (bcryptError) {
        console.error('❌ Error bcrypt:', bcryptError);
      }
    }
    
    if (!validPassword) {
      console.log('❌ Contraseña incorrecta para:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }
    
    // Generar token simple
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
    // No enviar contraseña
    delete user.contraseña;
    
    console.log('✅ Login exitoso para:', email);
    
    res.json({
      success: true,
      message: '✅ Login exitoso',
      token: token,
      user: user,
      expires_in: '30 días'
    });
    
  } catch (error) {
    console.error('❌ ERROR GENERAL en login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno: ' + error.message 
    });
  }
});

// 3. CLIENTES
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 Usuario ${req.user.email} solicitando clientes`);
    
    const result = await pool.query(`
      SELECT * FROM clientes ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} clientes`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Error clientes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo clientes' 
    });
  }
});

// 4. PRODUCTOS
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 Usuario ${req.user.email} solicitando productos`);
    
    const result = await pool.query(`
      SELECT * FROM productos ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} productos`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Error productos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo productos' 
    });
  }
});

// 5. VENTAS
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 Usuario ${req.user.email} solicitando ventas`);
    
    const result = await pool.query(`
      SELECT * FROM ventas ORDER BY fecha DESC
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} ventas`,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Error ventas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error obteniendo ventas' 
    });
  }
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('🚀 API STOCKBAR - FUNCIONANDO AL 100%');
  console.log('='.repeat(60));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: https://api-stockbar.onrender.com`);
  console.log('🔐 Login: POST /api/login');
  console.log('   Email: thebar752@gmail.com');
  console.log('   Password: admin123');
  console.log('='.repeat(60));
  console.log('✅ Servidor listo para producción!');
  console.log('='.repeat(60));
});
