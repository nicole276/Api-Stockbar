// config/email.js
const nodemailer = require('nodemailer');

console.log('📧 EMAIL_USER:', process.env.EMAIL_USER ? '✓ cargado' : '✗ NO cargado');
console.log('🔐 EMAIL_PASS:', process.env.EMAIL_PASS ? '✓ (oculto)' : '✗ NO cargado');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error) => {
  if (error) console.log('❌ Error en email:', error.message);
  else console.log('✅ Email configurado correctamente');
});

module.exports = transporter;