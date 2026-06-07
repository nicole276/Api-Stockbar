// config/email.js

// ── Verificación de variables de entorno ─────────────────────
console.log('='.repeat(60));
console.log('📧 CONFIGURACIÓN DE CORREO (BREVO)');
console.log('='.repeat(60));
console.log('📧 BREVO_EMAIL:', process.env.BREVO_EMAIL ? '✓ cargado' : '✗ NO cargado');
console.log('🔐 BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✓ (oculto)' : '✗ NO cargado');

if (!process.env.BREVO_API_KEY || !process.env.BREVO_EMAIL) {
  console.error('❌ ERROR: Faltan variables BREVO_API_KEY o BREVO_EMAIL');
}

console.log('✅ Cliente Brevo inicializado correctamente');
console.log('='.repeat(60));

const sendMail = async (mailOptions) => {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: 'The Bar - Sistema de Gestión',
          email: process.env.BREVO_EMAIL
        },
        to: [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Brevo:', data);
      throw new Error(data.message || 'Error al enviar el correo');
    }

    console.log('✅ Correo enviado exitosamente. ID:', data.messageId);
    return data;
  } catch (error) {
    console.error('❌ Error enviando correo:', error.message);
    throw error;
  }
};

module.exports = { sendMail };