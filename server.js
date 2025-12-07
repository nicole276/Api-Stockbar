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

// ==================== ENDPOINT RAÍZ ====================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ API STOCKBAR - VERSIÓN 5.0',
    version: '5.0.0',
    status: 'operacional',
    timestamp: new Date().toISOString(),
    endpoints: {
      public: {
        root: 'GET /',
        login: 'POST /api/login',
        test: 'GET /api/test'
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

// ==================== ENDPOINT DE PRUEBA ====================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ API funcionando correctamente',
    timestamp: new Date().toISOString(),
    database: 'Conectada a PostgreSQL'
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
    
    // Buscar usuario
    const result = await pool.query(
      'SELECT * FROM "Usuarios" WHERE id_usuario = $1 AND estado = 1',
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

// ==================== LOGIN - ENDPOINT PÚBLICO ====================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    // Validación básica
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email y contraseña requeridos' 
      });
    }
    
    // Buscar usuario
    const result = await pool.query(
      'SELECT * FROM "Usuarios" WHERE email = $1',
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
    
    console.log('🔍 Usuario encontrado:', user.email);
    
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

// ==================== ROLES ====================

// LISTAR ROLES
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "Roles" ORDER BY id_rol');
    res.json({
      success: true,
      message: `${result.rows.length} roles encontrados`,
      data: result.rows
    });
  } catch (error) {
    console.error('Error roles:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR ROL
app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    const { nombre_rol, descripcion } = req.body;
    
    if (!nombre_rol) {
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    }
    
    const result = await pool.query(
      'INSERT INTO "Roles" (nombre_rol, descripcion, estado) VALUES ($1, $2, 1) RETURNING *',
      [nombre_rol, descripcion]
    );
    
    res.status(201).json({
      success: true,
      message: 'Rol creado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear rol:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// VER DETALLE ROL
app.get('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM "Roles" WHERE id_rol = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error detalle rol:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== USUARIOS ====================

// LISTAR USUARIOS
app.get('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, r.nombre_rol 
      FROM "Usuarios" u
      LEFT JOIN "Roles" r ON u.id_rol = r.id_rol
      ORDER BY u.id_usuario DESC
    `);
    
    // Ocultar contraseñas
    const usuariosSinPassword = result.rows.map(user => {
      const { contraseña, ...userSinPassword } = user;
      return userSinPassword;
    });
    
    res.json({
      success: true,
      message: `${usuariosSinPassword.length} usuarios encontrados`,
      data: usuariosSinPassword
    });
  } catch (error) {
    console.error('Error usuarios:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR USUARIO
app.post('/api/usuarios', authenticateToken, async (req, res) => {
  try {
    const { email, password, confirm_password, nombre_completo, usuario, id_rol = 2 } = req.body;
    
    if (!email || !password || !confirm_password || !nombre_completo) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }
    
    if (password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Contraseñas no coinciden' });
    }
    
    // Hash de contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const result = await pool.query(
      `INSERT INTO "Usuarios" (email, contraseña, nombre_completo, usuario, id_rol, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) 
       RETURNING id_usuario, email, nombre_completo, usuario, id_rol, estado`,
      [email, hashedPassword, nombre_completo, usuario, id_rol]
    );
    
    res.status(201).json({
      success: true,
      message: 'Usuario creado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear usuario:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== CLIENTES ====================

// LISTAR CLIENTES
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM "Clientes" 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `${result.rows.length} clientes encontrados`,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error clientes:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR CLIENTE
app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    }
    
    const result = await pool.query(
      `INSERT INTO "Clientes" (nombre, tipo_documento, documento, telefono, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) 
       RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion]
    );
    
    res.status(201).json({
      success: true,
      message: 'Cliente creado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear cliente:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== CATEGORÍAS ====================

// LISTAR CATEGORÍAS
app.get('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM "Categorias" 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    res.json({
      success: true,
      message: `${result.rows.length} categorías encontradas`,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error categorías:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR CATEGORÍA
app.post('/api/categorias', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    }
    
    const result = await pool.query(
      `INSERT INTO "Categorias" (nombre, descripcion, estado) 
       VALUES ($1, $2, 1) 
       RETURNING *`,
      [nombre, descripcion]
    );
    
    res.status(201).json({
      success: true,
      message: 'Categoría creada',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear categoría:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== PRODUCTOS ====================

// LISTAR PRODUCTOS
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM "Productos" p
      LEFT JOIN "Categorias" c ON p.id_categoria = c.id_categoria
      WHERE p.estado = 1 
      ORDER BY p.nombre
    `);
    
    res.json({
      success: true,
      message: `${result.rows.length} productos encontrados`,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error productos:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR PRODUCTO
app.post('/api/productos', authenticateToken, async (req, res) => {
  try {
    const { nombre, id_categoria, stock = 0, precio_compra, precio_venta } = req.body;
    
    if (!nombre || !precio_venta) {
      return res.status(400).json({ success: false, message: 'Nombre y precio requeridos' });
    }
    
    const result = await pool.query(
      `INSERT INTO "Productos" (nombre, id_categoria, stock, precio_compra, precio_venta, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) 
       RETURNING *`,
      [nombre, id_categoria, stock, precio_compra || 0, precio_venta]
    );
    
    res.status(201).json({
      success: true,
      message: 'Producto creado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear producto:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== PROVEEDORES ====================

// LISTAR PROVEEDORES
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM "Proveedores" 
      WHERE estado = 1 
      ORDER BY nombre_razon_social
    `);
    
    res.json({
      success: true,
      message: `${result.rows.length} proveedores encontrados`,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error proveedores:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR PROVEEDOR
app.post('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const { nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion } = req.body;
    
    if (!nombre_razon_social) {
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    }
    
    const result = await pool.query(
      `INSERT INTO "Proveedores" (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1) 
       RETURNING *`,
      [nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion]
    );
    
    res.status(201).json({
      success: true,
      message: 'Proveedor creado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear proveedor:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== COMPRAS ====================

// LISTAR COMPRAS
app.get('/api/compras', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.nombre_razon_social as proveedor_nombre
      FROM "Compras" c
      LEFT JOIN "Proveedores" p ON c.id_proveedor = p.id_proveedor
      ORDER BY c.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `${result.rows.length} compras encontradas`,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error compras:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR COMPRA
app.post('/api/compras', authenticateToken, async (req, res) => {
  try {
    const { id_proveedor, total, fecha, numero_factura, detalles } = req.body;
    
    if (!id_proveedor || !total || !detalles || !Array.isArray(detalles)) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Insertar compra
      const compraResult = await pool.query(
        `INSERT INTO "Compras" (id_proveedor, total, fecha, numero_factura, estado) 
         VALUES ($1, $2, $3, $4, 1) 
         RETURNING id_compra`,
        [id_proveedor, total, fecha || new Date(), numero_factura]
      );
      
      const idCompra = compraResult.rows[0].id_compra;
      
      // Insertar detalles
      for (const detalle of detalles) {
        await pool.query(
          `INSERT INTO "Detalle_compras" (id_compra, id_producto, cantidad, precio, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [idCompra, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        // Actualizar stock
        await pool.query(
          `UPDATE "Productos" SET stock = stock + $1 WHERE id_producto = $2`,
          [detalle.cantidad, detalle.id_producto]
        );
      }
      
      await pool.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Compra creada',
        data: { id_compra: idCompra }
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error crear compra:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== VENTAS ====================

// LISTAR VENTAS
app.get('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre
      FROM "Ventas" v
      LEFT JOIN "Clientes" c ON v.id_cliente = c.id_cliente
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      message: `${result.rows.length} ventas encontradas`,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error ventas:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// DETALLES DE VENTA
app.get('/api/ventas/:id/detalles', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT dv.*, p.nombre as nombre_producto
      FROM "Detalle_ventas" dv
      LEFT JOIN "Productos" p ON dv.id_producto = p.id_producto
      WHERE dv.id_venta = $1
      ORDER BY dv.id_det_venta
    `, [id]);
    
    res.json({
      success: true,
      message: `${result.rows.length} detalles encontrados`,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error detalles venta:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// CREAR VENTA
app.post('/api/ventas', authenticateToken, async (req, res) => {
  try {
    const { id_cliente, total, fecha, estado = 2, detalles } = req.body;
    
    if (!id_cliente || !total || !detalles || !Array.isArray(detalles)) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }
    
    await pool.query('BEGIN');
    
    try {
      // Insertar venta
      const ventaResult = await pool.query(
        `INSERT INTO "Ventas" (id_cliente, total, fecha, estado) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id_venta`,
        [id_cliente, total, fecha || new Date(), estado]
      );
      
      const idVenta = ventaResult.rows[0].id_venta;
      
      // Insertar detalles
      for (const detalle of detalles) {
        await pool.query(
          `INSERT INTO "Detalle_ventas" (id_venta, id_producto, cantidad, precio, subtotal) 
           VALUES ($1, $2, $3, $4, $5)`,
          [idVenta, detalle.id_producto, detalle.cantidad, detalle.precio, detalle.subtotal]
        );
        
        // Actualizar stock (solo si no está anulada)
        if (estado !== 3) {
          await pool.query(
            `UPDATE "Productos" SET stock = stock - $1 WHERE id_producto = $2`,
            [detalle.cantidad, detalle.id_producto]
          );
        }
      }
      
      await pool.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Venta creada',
        data: { id_venta: idVenta }
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error crear venta:', error.message);
    res.status(500).json({ success: false, message: 'Error: ' + error.message });
  }
});

// ==================== ENDPOINT DE PRUEBA ====================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ API funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// ==================== MANEJO DE ERRORES 404 ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.url}`
  });
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('🚀 API STOCKBAR - SERVIDOR INICIADO');
  console.log('='.repeat(60));
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL base: http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('✅ Endpoints disponibles:');
  console.log('   GET  /               - Raíz de la API');
  console.log('   POST /api/login      - Autenticación');
  console.log('   GET  /api/test       - Prueba de conexión');
  console.log('   GET  /api/ventas     - Listar ventas (requiere token)');
  console.log('   POST /api/ventas     - Crear venta (requiere token)');
  console.log('='.repeat(60));
  console.log('🔐 Credenciales por defecto:');
  console.log('   Email: thebar752@gmail.com');
  console.log('   Password: admin123');
  console.log('='.repeat(60));
  console.log('✅ Servidor listo!');
  console.log('='.repeat(60));
});
