// db.js
const { Pool } = require('pg');
require('dotenv').config();

// Configuración específica para Neon.tech
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true // Neon requiere SSL estricto
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Eventos para monitoreo
pool.on('connect', () => {
  console.log('✅ Conexión a Neon PostgreSQL establecida');
});

pool.on('error', (err) => {
  console.error('⚠️ Error en pool de conexiones:', err.message);
  process.exit(-1);
});

// Verificar conexión al iniciar
(async () => {
  try {
    const result = await pool.query('SELECT version()');
    console.log('🟢 Neon PostgreSQL conectado exitosamente');
    console.log('📦 Versión:', result.rows[0].version.split(' ')[0]);
  } catch (error) {
    console.error('❌ Error fatal conectando a Neon:');
    console.error('   Mensaje:', error.message);
    console.error('   💡 Verifica:');
    console.error('      1. DATABASE_URL en .env es correcto');
    console.error('      2. Tu IP está permitida en Neon Console (Project Settings > Connection Details > IP Allowlist)');
    console.error('      3. La base de datos "neondb" existe');
    process.exit(1);
  }
})();

module.exports = pool;