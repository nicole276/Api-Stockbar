const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ CONFIGURACIÓN PARA RENDER - POSTGRESQL EN LA NUBE
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Almacenamiento temporal de códigos de verificación (en producción usar Redis)
const verificationCodes = new Map();

// ==================== ENDPOINTS DE AUTENTICACIÓN ====================

// 1. Endpoint para verificar email
app.post('/api/verificar-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email es requerido' 
      });
    }
    
    // Verificar si el email existe en la base de datos
    const result = await pool.query(
      'SELECT id_usuario, email FROM usuarios WHERE email = $1',
      [email]
    );
    
    const exists = result.rows.length > 0;
    
    // Generar código de verificación (6 dígitos)
    if (exists) {
      const codigo = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Guardar código con timestamp (expira en 10 minutos)
      verificationCodes.set(email, {
        codigo,
        timestamp: Date.now(),
        expira: Date.now() + (10 * 60 * 1000) // 10 minutos
      });
      
      console.log(`📧 Código de verificación para ${email}: ${codigo}`);
      console.log('⚠️ En producción, enviar este código por email/SMS');
      
      return res.json({ 
        success: true, 
        exists: true,
        message: 'Email encontrado. Código de verificación generado.',
        // Solo en desarrollo enviamos el código
        codigo: codigo // Remover en producción
      });
    } else {
      return res.json({ 
        success: true, 
        exists: false,
        message: 'Email no encontrado en el sistema' 
      });
    }
    
  } catch (error) {
    console.error('❌ Error al verificar email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 2. Endpoint para actualizar contraseña
app.post('/api/actualizar-password', async (req, res) => {
  try {
    const { email, newPassword, codigo } = req.body;
    
    if (!email || !newPassword || !codigo) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email, nueva contraseña y código son requeridos' 
      });
    }
    
    // Verificar si hay un código para este email
    const storedCode = verificationCodes.get(email);
    
    if (!storedCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'No hay código de verificación para este email' 
      });
    }
    
    // Verificar si el código ha expirado
    if (Date.now() > storedCode.expira) {
      verificationCodes.delete(email);
      return res.status(400).json({ 
        success: false, 
        message: 'El código ha expirado. Por favor solicite uno nuevo.' 
      });
    }
    
    // Verificar que el código coincida
    if (storedCode.codigo !== codigo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Código de verificación incorrecto' 
      });
    }
    
    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Actualizar la contraseña en la base de datos
    const result = await pool.query(
      'UPDATE usuarios SET contraseña = $1 WHERE email = $2 RETURNING id_usuario, email, usuario',
      [hashedPassword, email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    // Eliminar el código usado
    verificationCodes.delete(email);
    
    console.log(`✅ Contraseña actualizada para: ${email}`);
    
    res.json({ 
      success: true, 
      message: 'Contraseña actualizada exitosamente',
      user: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error al actualizar contraseña:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 3. Endpoint para login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email y contraseña son requeridos' 
      });
    }
    
    // Buscar usuario por email
    const result = await pool.query(
      `SELECT u.*, r.nombre_rol 
       FROM usuarios u 
       LEFT JOIN roles r ON u.id_rol = r.id_rol 
       WHERE u.email = $1 AND u.estado = 1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales incorrectas o usuario inactivo' 
      });
    }
    
    const user = result.rows[0];
    
    // Verificar contraseña (comparar hash)
    const passwordMatch = await bcrypt.compare(password, user.contraseña);
    
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales incorrectas' 
      });
    }
    
    // Generar token simple (en producción usar JWT)
    const token = Buffer.from(`${user.id_usuario}:${Date.now()}`).toString('base64');
    
    // Remover contraseña del objeto de respuesta
    const { contraseña, ...userWithoutPassword } = user;
    
    res.json({ 
      success: true, 
      token: token,
      user: userWithoutPassword,
      message: 'Login exitoso'
    });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== ENDPOINT PARA CREAR TODAS LAS TABLAS ====================
app.get('/api/create-all-tables', async (req, res) => {
  try {
    console.log('🔄 Creando tablas...');

    // TABLA ROLES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id_rol SERIAL PRIMARY KEY,
        nombre_rol VARCHAR(50),
        descripcion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // TABLA PERMISOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permisos (
        id_permiso SERIAL PRIMARY KEY,
        id_rol INTEGER
      );
    `);

    // TABLA VER_DETALLE_ROL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ver_detalle_rol (
        id_detalle SERIAL PRIMARY KEY,
        id_rol INTEGER REFERENCES roles(id_rol),
        id_permiso INTEGER REFERENCES permisos(id_permiso)
      );
    `);

    // TABLA USUARIOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario SERIAL PRIMARY KEY,
        id_rol INTEGER REFERENCES roles(id_rol),
        nombre_completo VARCHAR(50),
        email VARCHAR(50) UNIQUE,
        usuario VARCHAR(50),
        contraseña VARCHAR(255),
        estado SMALLINT
      );
    `);

    // TABLA CATEGORIAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id_categoria SERIAL PRIMARY KEY,
        nombre VARCHAR(50),
        descripcion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // TABLA PRODUCTOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id_producto SERIAL PRIMARY KEY,
        id_categoria INTEGER REFERENCES categorias(id_categoria),
        nombre VARCHAR(50),
        stock INTEGER,
        precio_compra DECIMAL(10,2),
        precio_venta DECIMAL(10,2),
        estado SMALLINT
      );
    `);

    // TABLA PROVEEDORES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id_proveedor SERIAL PRIMARY KEY,
        nombre_razon_social VARCHAR(50),
        tipo_documento VARCHAR(20),
        documento INTEGER,
        contacto VARCHAR(50),
        telefono VARCHAR(15),
        email VARCHAR(50),
        direccion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // TABLA COMPRAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compras (
        id_compra SERIAL PRIMARY KEY,
        id_proveedor INTEGER REFERENCES proveedores(id_proveedor),
        fecha TIMESTAMP,
        total DECIMAL(10,2),
        numero_factura VARCHAR(50),
        estado SMALLINT
      );
    `);

    // TABLA DETALLE_COMPRAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS detalle_compras (
        id_det_compra SERIAL PRIMARY KEY,
        id_compra INTEGER REFERENCES compras(id_compra),
        id_producto INTEGER REFERENCES productos(id_producto),
        cantidad INTEGER,
        precio DECIMAL(10,2),
        subtotal DECIMAL(10,2)
      );
    `);

    // TABLA CLIENTES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id_cliente SERIAL PRIMARY KEY,
        nombre VARCHAR(50),
        tipo_documento VARCHAR(20),
        documento VARCHAR(20),
        telefono VARCHAR(15),
        direccion VARCHAR(50),
        estado SMALLINT
      );
    `);

    // TABLA VENTAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id_venta SERIAL PRIMARY KEY,
        id_cliente INTEGER REFERENCES clientes(id_cliente),
        fecha TIMESTAMP,
        total DECIMAL(10,2),
        estado SMALLINT
      );
    `);

    // TABLA DETALLE_VENTAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id_det_venta SERIAL PRIMARY KEY,
        id_venta INTEGER REFERENCES ventas(id_venta),
        id_producto INTEGER REFERENCES productos(id_producto),
        cantidad INTEGER,
        precio DECIMAL(10,2),
        subtotal DECIMAL(10,2)
      );
    `);

    console.log('✅ Tablas creadas, insertando datos...');

    // INSERTAR DATOS
    await pool.query(`
      INSERT INTO roles (nombre_rol, descripcion, estado) VALUES
      ('Administrador', 'Acceso total al sistema', 1),
      ('Cajero', 'Puede realizar ventas', 1),
      ('Bodeguero', 'Gestiona inventario', 1)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO permisos (id_rol) VALUES (1), (2), (3)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO ver_detalle_rol (id_rol, id_permiso) VALUES
      (1, 1), (2, 2), (3, 3)
      ON CONFLICT DO NOTHING;
    `);

    // Hashear contraseñas antes de insertarlas
    const adminHash = await bcrypt.hash('admin123', 10);
    const cajaHash = await bcrypt.hash('caja123', 10);
    const bodegaHash = await bcrypt.hash('bodega123', 10);

    await pool.query(`
      INSERT INTO usuarios (id_rol, nombre_completo, email, usuario, contraseña, estado) VALUES
      (1, 'Carlos Admin', 'admin@elbar.com', 'carlosadmin', $1, 1),
      (2, 'Maria Cajera', 'caja@elbar.com', 'mariacaja', $2, 1),
      (3, 'Pedro Bodega', 'bodega@elbar.com', 'pedrobodega', $3, 1)
      ON CONFLICT DO NOTHING;
    `, [adminHash, cajaHash, bodegaHash]);

    await pool.query(`
      INSERT INTO categorias (nombre, descripcion, estado) VALUES
      ('Licores', 'Bebidas alcoholicas fuertes', 1),
      ('Cervezas', 'Cervezas nacionales e importadas', 1),
      ('Cigarrillos', 'Marcas de cigarrillos', 1),
      ('Dulcería', 'Snacks y botanas', 1)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO productos (id_categoria, nombre, stock, precio_compra, precio_venta, estado) VALUES
      (1, 'Aguardiente Antioqueño 750ml', 50, 35000, 52000, 1),
      (1, 'Ron Medellín Añejo 750ml', 30, 45000, 65000, 1),
      (1, 'Ron Viejo de Caldas 750ml', 25, 38000, 55000, 1),
      (2, 'Cerveza Águila Lata 330ml', 200, 2500, 4500, 1),
      (2, 'Cerveza Poker Lata 330ml', 150, 2500, 4500, 1),
      (2, 'Cerveza Corona Botella 355ml', 80, 5000, 8000, 1),
      (3, 'Cigarrillo Marlboro Rojo', 100, 4500, 7000, 1),
      (3, 'Cigarrillo Marlboro Gold', 90, 4500, 7000, 1),
      (3, 'Cigarrillo Lucky Strike', 80, 4200, 6500, 1),
      (4, 'Papas Margarita Natural', 60, 3200, 5500, 1),
      (4, 'Papas Margarita Pollo', 45, 3200, 5500, 1),
      (4, 'Platanitos Verdes', 55, 2800, 4800, 1)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO proveedores (nombre_razon_social, tipo_documento, documento, contacto, telefono, email, direccion, estado) VALUES
      ('Bavaria S.A.', 'NIT', 860000123, 'Juan Distribuidor', '6012345678', 'ventas@bavaria.com.co', 'Autopista Norte #125-80, Bogotá', 1),
      ('Distribuidora La Rebaja', 'NIT', 860000789, 'Carlos Suministros', '6034567890', 'compras@larebaja.com.co', 'Avenida 68 #15-40, Cali', 1),
      ('Licores de Colombia S.A.', 'NIT', 860000456, 'Maria Proveedora', '6023456789', 'pedidos@licorescolombia.com.co', 'Calle 100 #25-50, Medellín', 1)
      ON CONFLICT DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO clientes (nombre, tipo_documento, documento, telefono, direccion, estado) VALUES
      ('Ana Maria López', 'CC', '1023456789', '3001234567', 'Carrera 80 #25-35, Medellín', 1),
      ('Carlos Andrés Rodríguez', 'CC', '5234567890', '3102345678', 'Calle 50 #45-20, Bogotá', 1),
      ('Laura Valentina García', 'CC', '2345678901', '3203456789', 'Avenida 68 #15-40, Cali', 1)
      ON CONFLICT DO NOTHING;
    `);

    console.log('✅ Todas las tablas y datos creados exitosamente!');

    res.json({ 
      success: true, 
      message: 'Base de datos creada exitosamente',
      tablas_creadas: [
        'roles', 'permisos', 'ver_detalle_rol', 'usuarios',
        'categorias', 'productos', 'proveedores', 'compras',
        'detalle_compras', 'clientes', 'ventas', 'detalle_ventas'
      ],
      usuarios_creados: [
        { email: 'admin@elbar.com', password: 'admin123', rol: 'Administrador' },
        { email: 'caja@elbar.com', password: 'caja123', rol: 'Cajero' },
        { email: 'bodega@elbar.com', password: 'bodega123', rol: 'Bodeguero' }
      ]
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== ENDPOINTS CRUD - PRODUCTOS ====================
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id_producto, p.nombre, c.nombre as categoria, 
             p.stock, p.precio_compra, p.precio_venta, 
             CASE WHEN p.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as estado
      FROM productos p 
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria 
      ORDER BY p.id_producto
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p 
      LEFT JOIN categorias c ON p.id_categoria = c.id_categoria 
      WHERE p.id_producto = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const { id_categoria, nombre, stock, precio_compra, precio_venta, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO productos (id_categoria, nombre, stock, precio_compra, precio_venta, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Producto creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_categoria, nombre, stock, precio_compra, precio_venta, estado } = req.body;
    
    const result = await pool.query(
      `UPDATE productos SET id_categoria=$1, nombre=$2, stock=$3, precio_compra=$4, precio_venta=$5, estado=$6 
       WHERE id_producto=$7 RETURNING *`,
      [id_categoria, nombre, stock, precio_compra, precio_venta, estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Producto actualizado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM productos WHERE id_producto = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Producto eliminado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/productos/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    const result = await pool.query(
      'UPDATE productos SET estado = $1 WHERE id_producto = $2 RETURNING *',
      [estado, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: `Estado del producto actualizado a ${estado === 1 ? 'Activo' : 'Inactivo'}`,
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ACTUALIZAR STOCK DE PRODUCTO ====================
app.patch('/api/productos/:id/stock', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { cantidad, operacion } = req.body;
    
    if (!cantidad || !operacion) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan parámetros: cantidad y operacion (sumar/restar)' 
      });
    }
    
    // Verificar si el producto existe
    const productoExistente = await client.query(
      'SELECT * FROM productos WHERE id_producto = $1',
      [id]
    );
    
    if (productoExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    let query;
    let mensaje;
    
    if (operacion === 'sumar') {
      query = 'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2 RETURNING *';
      mensaje = `Stock aumentado en ${cantidad} unidades`;
    } else if (operacion === 'restar') {
      // Verificar que haya suficiente stock
      const stockActual = productoExistente.rows[0].stock;
      if (stockActual < cantidad) {
        return res.status(400).json({ 
          success: false, 
          error: `Stock insuficiente. Disponible: ${stockActual}, Solicitado: ${cantidad}` 
        });
      }
      query = 'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2 RETURNING *';
      mensaje = `Stock reducido en ${cantidad} unidades`;
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Operación no válida. Use "sumar" o "restar"' 
      });
    }
    
    const result = await client.query(query, [cantidad, id]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: mensaje,
      data: result.rows[0] 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ==================== ENDPOINTS CRUD - CLIENTES ====================
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY id_cliente');
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clientes', async (req, res) => {
  try {
    const { nombre, tipo_documento, documento, telefono, direccion, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO clientes (nombre, tipo_documento, documento, telefono, direccion, estado) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre, tipo_documento, documento, telefono, direccion, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Cliente creado exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ENDPOINTS CRUD - VENTAS ===================

// GET - Obtener todas las ventas
app.get('/api/ventas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      ORDER BY v.fecha DESC
    `);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Obtener una venta por ID
app.get('/api/ventas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre, c.documento as cliente_documento
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      WHERE v.id_venta = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Crear nueva venta
app.post('/api/ventas', async (req, res) => {
  try {
    const { id_cliente, total, estado } = req.body;
    
    const result = await pool.query(
      `INSERT INTO ventas (id_cliente, fecha, total, estado) 
       VALUES ($1, NOW(), $2, $3) RETURNING *`,
      [id_cliente, total, estado || 1]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Venta creada exitosamente',
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Actualizar venta
app.put('/api/ventas/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { id_cliente, total, estado } = req.body;
    
    // Verificar si la venta existe
    const ventaExistente = await client.query(
      'SELECT * FROM ventas WHERE id_venta = $1',
      [id]
    );
    
    if (ventaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    // Si se está cambiando el estado, manejar stock
    const ventaActual = ventaExistente.rows[0];
    if (estado !== undefined && ventaActual.estado !== estado) {
      // Obtener detalles de la venta
      const detallesResult = await client.query(
        'SELECT * FROM detalle_ventas WHERE id_venta = $1',
        [id]
      );
      
      const productos = detallesResult.rows;
      
      // Si se cambia a Anulada (2) desde otro estado
      if (estado === 2 && ventaActual.estado !== 2) {
        // Devolver productos al stock
        for (const producto of productos) {
          await client.query(
            'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
            [producto.cantidad, producto.id_producto]
          );
          console.log(`🔄 Venta ${id}: Producto ${producto.id_producto} +${producto.cantidad} al stock`);
        }
      }
      // Si se reactiva desde Anulada (2) a otro estado
      else if (ventaActual.estado === 2 && estado !== 2) {
        // Restar productos del stock
        for (const producto of productos) {
          await client.query(
            'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
            [producto.cantidad, producto.id_producto]
          );
          console.log(`🔄 Venta ${id}: Producto ${producto.id_producto} -${producto.cantidad} del stock`);
        }
      }
    }
    
    const result = await client.query(
      `UPDATE ventas SET id_cliente=$1, total=$2, estado=$3 
       WHERE id_venta=$4 RETURNING *`,
      [id_cliente, total, estado, id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Venta actualizada exitosamente',
      data: result.rows[0] 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// PATCH - Cambiar solo el estado de la venta (CON DEVOLUCIÓN DE STOCK)
app.patch('/api/ventas/:id/estado', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { estado } = req.body;
    
    if (estado === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'El parámetro "estado" es requerido' 
      });
    }
    
    // 1. Verificar si la venta existe y obtener su estado actual
    const ventaExistente = await client.query(
      'SELECT * FROM ventas WHERE id_venta = $1',
      [id]
    );
    
    if (ventaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const ventaActual = ventaExistente.rows[0];
    const estadoAnterior = ventaActual.estado;
    
    // 2. Obtener los productos de la venta
    const detallesResult = await client.query(
      'SELECT * FROM detalle_ventas WHERE id_venta = $1',
      [id]
    );
    
    const productos = detallesResult.rows;
    
    // 3. Manejar cambios de estado que afectan el stock
    console.log(`🔄 Cambiando estado venta ${id}: ${estadoAnterior} → ${estado}`);
    
    // CASO 1: Anular venta (estado 2)
    if (estado === 2 && estadoAnterior !== 2) {
      console.log(`📦 Devolviendo productos al stock para venta ${id}`);
      
      for (const producto of productos) {
        await client.query(
          'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
          [producto.cantidad, producto.id_producto]
        );
        console.log(`   ✅ Producto ${producto.id_producto}: +${producto.cantidad} unidades`);
      }
    }
    // CASO 2: Reactivar venta (de estado 2 a otro)
    else if (estadoAnterior === 2 && estado !== 2) {
      console.log(`📦 Restando productos del stock para reactivar venta ${id}`);
      
      for (const producto of productos) {
        // Verificar stock disponible antes de restar
        const productoInfo = await client.query(
          'SELECT stock FROM productos WHERE id_producto = $1',
          [producto.id_producto]
        );
        
        if (productoInfo.rows.length > 0) {
          const stockDisponible = productoInfo.rows[0].stock;
          if (stockDisponible < producto.cantidad) {
            throw new Error(`Stock insuficiente para producto ${producto.id_producto}. Disponible: ${stockDisponible}, Necesario: ${producto.cantidad}`);
          }
        }
        
        await client.query(
          'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
          [producto.cantidad, producto.id_producto]
        );
        console.log(`   ✅ Producto ${producto.id_producto}: -${producto.cantidad} unidades`);
      }
    }
    // CASO 3: Cambio entre otros estados (0, 1) - no afecta stock
    else {
      console.log(`ℹ️ Cambio de estado que no afecta stock: ${estadoAnterior} → ${estado}`);
    }
    
    // 4. Actualizar estado de la venta
    const result = await client.query(
      'UPDATE ventas SET estado = $1 WHERE id_venta = $2 RETURNING *',
      [estado, id]
    );
    
    await client.query('COMMIT');
    
    const textoEstado = estado === 1 ? 'Completada' : estado === 2 ? 'Anulada' : 'Pendiente';
    const textoAnterior = estadoAnterior === 1 ? 'Completada' : estadoAnterior === 2 ? 'Anulada' : 'Pendiente';
    
    let mensaje = `Estado de la venta cambiado de "${textoAnterior}" a "${textoEstado}"`;
    
    if (estado === 2 && estadoAnterior !== 2) {
      mensaje += '. Productos devueltos al stock.';
    } else if (estadoAnterior === 2 && estado !== 2) {
      mensaje += '. Productos restados del stock.';
    }
    
    res.json({ 
      success: true, 
      message: mensaje,
      data: {
        ...result.rows[0],
        productos_afectados: productos.length,
        estado_anterior: estadoAnterior,
        estado_nuevo: estado
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al cambiar estado de venta:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// DELETE - Eliminar venta
app.delete('/api/ventas/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Verificar si la venta existe
    const ventaExistente = await client.query(
      'SELECT * FROM ventas WHERE id_venta = $1',
      [id]
    );
    
    if (ventaExistente.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    // Obtener productos para devolver al stock
    const detallesResult = await client.query(
      'SELECT * FROM detalle_ventas WHERE id_venta = $1',
      [id]
    );
    
    const productos = detallesResult.rows;
    
    // Devolver productos al stock
    for (const producto of productos) {
      await client.query(
        'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
        [producto.cantidad, producto.id_producto]
      );
    }
    
    // Primero eliminar los detalles de venta
    await client.query(
      'DELETE FROM detalle_ventas WHERE id_venta = $1',
      [id]
    );
    
    // Luego eliminar la venta
    const result = await client.query(
      'DELETE FROM ventas WHERE id_venta = $1 RETURNING *',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Venta eliminada exitosamente. Productos devueltos al stock.',
      data: result.rows[0],
      productos_devueltos: productos.length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ==================== VENTAS COMPLETAS CON DETALLES ====================
app.post('/api/ventas-completas', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id_cliente, total, productos } = req.body;
    
    if (!id_cliente || !total || !productos || !Array.isArray(productos)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan parámetros: id_cliente, total, productos (array)' 
      });
    }
    
    // 1. Verificar stock antes de proceder
    for (const producto of productos) {
      const productoInfo = await client.query(
        'SELECT stock, nombre FROM productos WHERE id_producto = $1',
        [producto.id_producto]
      );
      
      if (productoInfo.rows.length === 0) {
        throw new Error(`Producto con ID ${producto.id_producto} no encontrado`);
      }
      
      const stockDisponible = productoInfo.rows[0].stock;
      const cantidadSolicitada = producto.cantidad || 1;
      
      if (stockDisponible < cantidadSolicitada) {
        throw new Error(`Stock insuficiente para "${productoInfo.rows[0].nombre}". Disponible: ${stockDisponible}, Solicitado: ${cantidadSolicitada}`);
      }
    }
    
    // 2. Crear la venta principal
    const ventaResult = await client.query(
      `INSERT INTO ventas (id_cliente, fecha, total, estado) 
       VALUES ($1, NOW(), $2, $3) RETURNING *`,
      [id_cliente, total, 0] // Estado 0 = Pendiente por defecto
    );
    
    const ventaId = ventaResult.rows[0].id_venta;
    
    // 3. Crear los detalles de venta (productos)
    for (const producto of productos) {
      const cantidad = producto.cantidad || 1;
      const precio = producto.precio_unitario || 0;
      const subtotal = cantidad * precio;
      
      await client.query(
        `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio, subtotal) 
         VALUES ($1, $2, $3, $4, $5)`,
        [ventaId, producto.id_producto, cantidad, precio, subtotal]
      );
      
      // 4. Actualizar stock de productos (RESTAR stock)
      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id_producto = $2',
        [cantidad, producto.id_producto]
      );
      
      console.log(`📦 Venta ${ventaId}: Producto ${producto.id_producto} -${cantidad} unidades`);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      message: '✅ Venta registrada exitosamente. Stock actualizado.',
      data: {
        venta: ventaResult.rows[0],
        productos_vendidos: productos.length,
        total_productos: productos.reduce((sum, p) => sum + (p.cantidad || 1), 0)
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al registrar venta completa:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

app.get('/api/ventas-completas', async (req, res) => {
  try {
    // Obtener ventas principales
    const ventasResult = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
             c.documento as cliente_documento, c.tipo_documento as cliente_tipo_documento
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      ORDER BY v.fecha DESC
    `);
    
    const ventas = ventasResult.rows;
    
    // Para cada venta, obtener sus detalles
    for (let venta of ventas) {
      const detallesResult = await pool.query(`
        SELECT dv.*, p.nombre as producto_nombre, p.precio_venta
        FROM detalle_ventas dv 
        LEFT JOIN productos p ON dv.id_producto = p.id_producto 
        WHERE dv.id_venta = $1
      `, [venta.id_venta]);
      
      venta.productos = detallesResult.rows;
    }
    
    res.json({
      success: true,
      data: ventas,
      total: ventas.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== OBTENER VENTA CON DETALLES COMPLETOS ====================
app.get('/api/ventas/:id/completa', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener venta principal
    const ventaResult = await pool.query(`
      SELECT v.*, c.nombre as cliente_nombre, c.documento, c.telefono, c.tipo_documento
      FROM ventas v 
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
      WHERE v.id_venta = $1
    `, [id]);
    
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const venta = ventaResult.rows[0];
    
    // Obtener productos de la venta
    const detallesResult = await pool.query(`
      SELECT dv.*, p.nombre as producto_nombre, p.precio_venta
      FROM detalle_ventas dv 
      LEFT JOIN productos p ON dv.id_producto = p.id_producto 
      WHERE dv.id_venta = $1
    `, [id]);
    
    venta.productos = detallesResult.rows;
    
    res.json({
      success: true,
      data: venta
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ANULAR VENTA Y DEVOLVER STOCK ====================
app.patch('/api/ventas/:id/anular', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // 1. Verificar si la venta existe
    const ventaResult = await client.query(
      `SELECT v.*, c.nombre as cliente_nombre 
       FROM ventas v 
       LEFT JOIN clientes c ON v.id_cliente = c.id_cliente 
       WHERE v.id_venta = $1`,
      [id]
    );
    
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    
    const venta = ventaResult.rows[0];
    
    // Verificar que no esté ya anulada
    if (venta.estado === 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'La venta ya está anulada' 
      });
    }
    
    // 2. Obtener los productos de la venta
    const detallesResult = await client.query(
      `SELECT dv.*, p.nombre as producto_nombre 
       FROM detalle_ventas dv 
       LEFT JOIN productos p ON dv.id_producto = p.id_producto 
       WHERE dv.id_venta = $1`,
      [id]
    );
    
    const productos = detallesResult.rows;
    
    if (productos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'La venta no tiene productos' 
      });
    }
    
    // 3. Devolver cada producto al stock
    console.log(`📦 Anulando venta ${id}: Devolviendo ${productos.length} productos al stock`);
    
    for (const producto of productos) {
      await client.query(
        'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
        [producto.cantidad, producto.id_producto]
      );
      
      console.log(`   ✅ Producto ${producto.producto_nombre} (ID: ${producto.id_producto}): +${producto.cantidad} unidades`);
    }
    
    // 4. Actualizar estado de la venta a "Anulada" (estado 2)
    const updateResult = await client.query(
      'UPDATE ventas SET estado = 2 WHERE id_venta = $1 RETURNING *',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: '✅ Venta anulada exitosamente. Productos devueltos al stock.',
      data: {
        venta: updateResult.rows[0],
        productos_devueltos: productos.length,
        productos: productos
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al anular venta:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// ==================== ENDPOINT DE ESTADO ====================
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as server_time');
    
    // Obtener conteos
    const productosCount = await pool.query('SELECT COUNT(*) FROM productos');
    const clientesCount = await pool.query('SELECT COUNT(*) FROM clientes');
    const ventasCount = await pool.query('SELECT COUNT(*) FROM ventas');
    const ventasActivas = await pool.query("SELECT COUNT(*) FROM ventas WHERE estado != 2");
    const usuariosCount = await pool.query('SELECT COUNT(*) FROM usuarios');
    
    res.json({
      success: true,
      message: '🚀 API StockBar funcionando correctamente',
      server_time: result.rows[0].server_time,
      version: '3.0.0',
      estadisticas: {
        productos: parseInt(productosCount.rows[0].count),
        clientes: parseInt(clientesCount.rows[0].count),
        ventas_totales: parseInt(ventasCount.rows[0].count),
        ventas_activas: parseInt(ventasActivas.rows[0].count),
        usuarios: parseInt(usuariosCount.rows[0].count)
      },
      endpoints_autenticacion: {
        verificar_email: 'POST /api/verificar-email',
        actualizar_password: 'POST /api/actualizar-password',
        login: 'POST /api/login'
      },
      endpoints_principales: {
        productos: 'GET /api/productos',
        clientes: 'GET /api/clientes',
        ventas: 'GET /api/ventas',
        ventas_completas: 'GET /api/ventas-completas',
        crear_venta: 'POST /api/ventas-completas',
        cambiar_estado_venta: 'PATCH /api/ventas/:id/estado',
        anular_venta: 'PATCH /api/ventas/:id/anular',
        actualizar_stock: 'PATCH /api/productos/:id/stock'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API StockBar - Sistema de Gestión para Licorería',
    version: '3.0.0',
    features: 'Gestión completa de ventas con control de stock automático y autenticación',
    endpoints: 'Visita /api/status para ver todos los endpoints disponibles',
    moneda: 'Todos los precios están en Pesos Colombianos (COP)',
    notas: [
      '✅ Sistema maneja devolución automática de stock al anular ventas',
      '✅ Sistema de autenticación completo con recuperación de contraseña',
      '✅ Contraseñas almacenadas de forma segura con bcrypt'
    ]
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Servidor API StockBar - VERSION 3.0');
  console.log('📡 Puerto: ' + PORT);
  console.log('🌐 URL: https://api-stockbar.onrender.com');
  console.log('📚 Documentación: /api/status');
  console.log('🔐 Características nuevas:');
  console.log('   • Sistema de autenticación completo');
  console.log('   • Recuperación de contraseña con códigos');
  console.log('   • Contraseñas encriptadas con bcrypt');
  console.log('   • Endpoints de login y recuperación');
  console.log('💰 Todos los precios en Pesos Colombianos (COP)');
  console.log('⚡ Para crear la base de datos: GET /api/create-all-tables');
});