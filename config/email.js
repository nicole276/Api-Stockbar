// config/email.js
const Brevo = require('@getbrevo/brevo');

// ── Verificación de variables de entorno ─────────────────────
console.log('='.repeat(60));
console.log('CONFIGURACIÓN DE CORREO (BREVO)');
console.log('='.repeat(60));
console.log('BREVO_EMAIL:', process.env.BREVO_EMAIL ? '✓ cargado' : '✗ NO cargado');
console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✓ (oculto)' : '✗ NO cargado');

// ── Validación de credenciales ───────────────────────────────
if (!process.env.BREVO_API_KEY || !process.env.BREVO_EMAIL) {
  console.error('ERROR: Faltan variables BREVO_API_KEY o BREVO_EMAIL');
}

// ── Inicializar instancia de la API de Brevo ─────────────────
const apiInstance = new Brevo.TransactionalEmailsApi();

// Configurar la API Key (forma correcta según documentación oficial)
apiInstance.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

console.log('Cliente Brevo inicializado correctamente');
console.log('='.repeat(60));

// ── Función para enviar correos transaccionales ──────────────
const sendMail = async (mailOptions) => {
  try {
    const email = new Brevo.SendSmtpEmail();

    email.subject = mailOptions.subject;
    email.htmlContent = mailOptions.html;
    email.sender = {
      name: 'The Bar - Sistema de Gestión',
      email: process.env.BREVO_EMAIL
    };
    email.to = [{ email: mailOptions.to }];

    const response = await apiInstance.sendTransacEmail(email);
    console.log('Correo enviado exitosamente. ID:', response.messageId);
    return response;
  } catch (error) {
    console.error('Error enviando correo:', error.message);
    if (error.response) {
      console.error('Detalles:', error.response.body);
    }
    throw error;
  }
};

// ── Exportar función ─────────────────────────────────────────
module.exports = { sendMail };