const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
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

// ==================== ENDPOINT RAÍZ ====================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ API STOCKBAR - VERSIÓN 6.0 (TABLAS MINÚSCULAS)',
    version: '6.0.0',
    status: 'operacional',
    timestamp: new Date().toISOString(),
    endpoints: {
      public: {
        root: 'GET /',
        login: 'POST /api/login',
        'verify-email': 'POST /api/verify-email',
        'send-recovery-code': 'POST /api/send-recovery-code',
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
      'SELECT id_usuario, email FROM usuarios WHERE email = $1',
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
        email: result.rows[0].email
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

// ==================== GENERAR CÓDIGO DE RECUPERACIÓN ====================
app.post('/api/generate-recovery-code', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email requerido' 
      });
    }
    
    // Generar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log(`🔐 Código generado para ${email}: ${codigo}`);
    
    // Guardar código en la base de datos (podrías usar una tabla temporal)
    // Por ahora solo lo devolvemos
    res.json({
      success: true,
      codigo: codigo,
      message: 'Código generado exitosamente',
      expires_in: '10 minutos'
    });
    
  } catch (error) {
    console.error('💥 ERROR en generate-recovery-code:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
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

// ==================== VERIFICACIÓN DE BASE DE DATOS ====================
app.get('/api/check-db', async (req, res) => {
  try {
    // 1. Ver todas las tablas
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    // 2. Ver estructura de tabla usuarios
    const usuariosColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'usuarios' 
      ORDER BY ordinal_position
    `);
    
    // 3. Ver datos de usuarios
    const usuariosData = await pool.query('SELECT id_usuario, email, nombre_completo FROM usuarios LIMIT 5');
    
    // 4. Verificar conexión
    const connectionTest = await pool.query('SELECT NOW() as server_time, version() as pg_version');
    
    res.json({
      success: true,
      tables: tables.rows.map(t => t.table_name),
      usuarios_columns: usuariosColumns.rows,
      usuarios_data: usuariosData.rows,
      connection: connectionTest.rows[0],
      message: '✅ Base de datos conectada correctamente',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      message: '❌ Error conectando a la base de datos'
    });
  }
});

// ==================== CLIENTES ====================

// LISTAR CLIENTES (TABLA EN MINÚSCULAS)
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando clientes`);
    
    const result = await pool.query(`
      SELECT * FROM clientes 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} clientes encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error clientes:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// CREAR CLIENTE (TABLA EN MINÚSCULAS)
app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    }
    
    const result = await pool.query(
      `INSERT INTO clientes (nombre, tipo_documento, documento, telefono, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) 
       RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion]
    );
    
    console.log(`✅ Cliente "${nombre}" creado por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Cliente creado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error crear cliente:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// VER DETALLE CLIENTE
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
    console.error('Error detalle cliente:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== PRODUCTOS ====================

// LISTAR PRODUCTOS (TABLAS EN MINÚSCULAS)
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando productos`);
    
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
      WHERE p.estado = 1 
      ORDER BY p.nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} productos encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error productos:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// CREAR PRODUCTO (TABLA EN MINÚSCULAS)
app.post('/api/productos', authenticateToken, async (req, res) => {
  try {
    const { nombre, id_categoria, stock = 0, precio_compra, precio_venta } = req.body;
    
    if (!nombre || !precio_venta) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y precio de venta son requeridos'
      });
    }
    
    const result = await pool.query(
      `INSERT INTO productos (nombre, id_categoria, stock, precio_compra, precio_venta, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) 
       RETURNING *`,
      [nombre, id_categoria, stock, precio_compra || 0, precio_venta]
    );
    
    console.log(`✅ Producto "${nombre}" creado por ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: '✅ Producto creado exitosamente',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error crear producto:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== VENTAS ====================

// LISTAR VENTAS (TABLAS EN MINÚSCULAS)
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando ventas`);
    
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} ventas encontradas`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error ventas:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// DETALLES DE VENTA (TABLAS EN MINÚSCULAS)
app.get('/api/ventas/:id/detalles', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📡 ${req.user.email} solicitando detalles de venta ${id}`);
    
    const result = await pool.query(`
      SELECT dv.*, p.nombre as nombre_producto
      FROM detalle_ventas dv
      LEFT JOIN productos p ON dv.id_producto = p.id_producto
      WHERE dv.id_venta = $1
      ORDER BY dv.id_det_venta
    `, [id]);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} detalles encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error detalles venta:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// CREAR VENTA (TABLAS EN MINÚSCULAS)
app.post('/api/ventas', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} creando nueva venta`);
    
    const { id_cliente, total, fecha, estado = 2, detalles } = req.body;
    
    if (!id_cliente || !total || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Datos incompletos: Se requiere cliente, total y al menos un producto'
      });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Insertar venta
      const ventaResult = await pool.query(
        `INSERT INTO ventas (id_cliente, total, fecha, estado) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id_venta`,
        [id_cliente, total, fecha || new Date(), estado]
      );
      
      const idVenta = ventaResult.rows[0].id_venta;
      
      // Insertar detalles
      for (const detalle of detalles) {
        await pool.query(
          `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [idVenta, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        // Actualizar stock (solo si no está anulada)
        if (estado !== 3) {
          await pool.query(
            `UPDATE productos SET stock = stock - $1 WHERE id_producto = $2`,
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      await pool.query('COMMIT');
      
      console.log(`✅ Venta ${idVenta} creada exitosamente`);
      
      res.status(201).json({
        success: true,
        message: '✅ Venta creada exitosamente',
        data: { id_venta: idVenta }
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error crear venta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al crear venta: ' + error.message
    });
  }
});

// ==================== COMPRAS ====================

// LISTAR COMPRAS (TABLAS EN MINÚSCULAS)
app.get('/api/compras', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando compras`);
    
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor
      ORDER BY c.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} compras encontradas`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error compras:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== CATEGORÍAS ====================

// LISTAR CATEGORÍAS (TABLA EN MINÚSCULAS)
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando categorías`);
    
    const result = await pool.query(`
      SELECT * FROM categorias 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} categorías encontradas`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error categorías:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== ROLES ====================

// LISTAR ROLES (TABLA EN MINÚSCULAS)
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando roles`);
    
    const result = await pool.query(`
      SELECT * FROM roles 
      ORDER BY id_rol
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} roles encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error roles:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== USUARIOS ====================

// LISTAR USUARIOS (TABLA EN MINÚSCULAS)
app.get('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando usuarios`);
    
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM usuarios u
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ORDER BY u.id_usuario DESC
    `);
    
    // Ocultar contraseñas
    const usuariosSinPassword = result.rows.map(user => {
      const { contraseña, ...userSinPassword } = user;
      return userSinPassword;
    });
    
    res.json({
      success: true,
      message: `✅ ${usuariosSinPassword.length} usuarios encontrados`,
      data: usuariosSinPassword
    });
    
  } catch (error) {
    console.error('Error usuarios:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== PROVEEDORES ====================

// LISTAR PROVEEDORES (TABLA EN MINÚSCULAS)
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando proveedores`);
    
    const result = await pool.query(`
      SELECT * FROM proveedores 
      WHERE estado = 1 
      ORDER BY nombre_razon_social
    `);
    
    res.json({
      success: true,
      message: `✅ ${result.rows.length} proveedores encontrados`,
      data: result.rows || []
    });
    
  } catch (error) {
    console.error('Error proveedores:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== DASHBOARD ====================

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    console.log(`📡 ${req.user.email} solicitando dashboard`);
    
    // Obtener estadísticas básicas
    const [
      totalClientes,
      totalProductos,
      totalVentas,
      totalCompras
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clientes WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM productos WHERE estado = 1'),
      pool.query('SELECT COUNT(*) FROM ventas'),
      pool.query('SELECT COUNT(*) FROM compras')
    ]);
    
    res.json({
      success: true,
      data: {
        total_clientes: parseInt(totalClientes.rows[0].count),
        total_productos: parseInt(totalProductos.rows[0].count),
        total_ventas: parseInt(totalVentas.rows[0].count),
        total_compras: parseInt(totalCompras.rows[0].count),
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error dashboard:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error: ' + error.message 
    });
  }
});

// ==================== MANEJO DE ERRORES 404 ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.url}`,
    suggestion: 'Visita la raíz (/) para ver los endpoints disponibles'
  });
});

// ==================== INICIAR SERVIDOR ====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(70));
  console.log('🚀 API STOCKBAR - VERSIÓN 6.0');
  console.log('='.repeat(70));
  console.log('✅ CONFIGURADO PARA TABLAS EN MINÚSCULAS');
  console.log('   • usuarios    • clientes    • productos');
  console.log('   • categorias  • proveedores • compras');
  console.log('   • ventas      • roles       • detalle_ventas');
  console.log('   • detalle_compras');
  console.log('='.repeat(70));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL local: http://localhost:${PORT}`);
  console.log(`🌍 URL pública: https://api-stockbar.onrender.com`);
  console.log('='.repeat(70));
  console.log('✅ Endpoints públicos:');
  console.log('   GET  /               - Raíz de la API');
  console.log('   POST /api/login      - Autenticación');
  console.log('   POST /api/verify-email - Verificar email');
  console.log('   POST /api/generate-recovery-code - Generar código');
  console.log('   POST /api/update-password - Actualizar contraseña');
  console.log('   GET  /api/test       - Prueba de conexión');
  console.log('   GET  /api/check-db   - Verificar base de datos');
  console.log('='.repeat(70));
  console.log('🔐 Credenciales por defecto:');
  console.log('   Email: thebar752@gmail.com');
  console.log('   Password: admin123');
  console.log('='.repeat(70));
  console.log('🔧 Funcionalidades de recuperación de contraseña:');
  console.log('   1. Verificar email del usuario');
  console.log('   2. Generar código de 6 dígitos');
  console.log('   3. Validar código en la app');
  console.log('   4. Actualizar contraseña encriptada');
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
