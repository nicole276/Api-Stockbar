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

// 2. LOGIN (ÚNICO endpoint público)
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    // Buscar usuario
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND estado = 1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    const user = result.rows[0];
    
    // VERIFICAR CONTRASEÑA (comparación directa para admin123)
    let validPassword = false;
    
    // Si la contraseña en BD es 'admin123' (sin hash)
    if (user.contraseña === 'admin123') {
      validPassword = (password === 'admin123');
    } 
    // Si es hash bcrypt
    else {
      validPassword = await bcrypt.compare(password, user.contraseña);
    }
    
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }
    
    // Generar token
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
    // No enviar contraseña
    delete user.contraseña;
    
    res.json({
      success: true,
      message: '✅ Login exitoso',
      token: token,
      user: user
    });
    
  } catch (error) {
    console.error('Error login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en servidor' 
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
