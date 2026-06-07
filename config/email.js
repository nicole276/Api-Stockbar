// config/email.js
const nodemailer = require('nodemailer');

// ── Verificación de variables de entorno ─────────────────────
console.log('='.repeat(60));
console.log('CONFIGURACIÓN DE CORREO');
console.log('='.repeat(60));
console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✓ cargado' : '✗ NO cargado');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '✓ (oculto)' : '✗ NO cargado');

// ── Validación de credenciales ───────────────────────────────
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('ERROR: Faltan variables EMAIL_USER o EMAIL_PASS en el entorno');
}

// ── Configuración del transporter con SMTP de Brevo ──────────
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // true para puerto 465, false para otros
  auth: {
    user: process.env.EMAIL_USER,   // add257001@smtp-brevo.com
    pass: process.env.EMAIL_PASS    // Tu clave SMTP de Brevo
  },
  tls: {
    rejectUnauthorized: false // Permite conexión en Render
  }
});

// ── Verificar conexión al iniciar ────────────────────────────
transporter.verify((error, success) => {
  if (error) {
    console.log('Error en conexión SMTP:', error.message);
  } else {
    console.log('Servidor SMTP de Brevo listo para enviar correos');
  }
});

console.log('='.repeat(60));

module.exports = transporter;