// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

console.log('🗄️ DATABASE_URL:', process.env.DATABASE_URL ? '✓ cargado' : '✗ NO cargado');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Crear tablas/columnas si no existen (idempotente - seguro ejecutar varias veces)
pool.query(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE
  )
`).catch(e => console.error('⚠️ Error creando password_resets:', e.message));

pool.query(`
  ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidades_por_paquete INT DEFAULT 1
`).catch(e => console.error('⚠️ Error agregando unidades_por_paquete:', e.message));

module.exports = pool;