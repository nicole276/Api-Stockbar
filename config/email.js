// config/email.js
const brevo = require('@getbrevo/brevo');

console.log('📧 BREVO_EMAIL:', process.env.BREVO_EMAIL ? '✓ cargado' : '✗ NO cargado');
console.log('🔐 BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✓ (oculto)' : '✗ NO cargado');

// Configuración de la API de Brevo
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// Verificar configuración
if (process.env.BREVO_API_KEY && process.env.BREVO_EMAIL) {
  console.log('Brevo configurado correctamente');
} else {
  console.log('Error: Faltan variables de entorno de Brevo');
}

// Función para enviar correos (compatible con el resto del código)
const sendMail = async (mailOptions) => {
  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = mailOptions.subject;
    sendSmtpEmail.htmlContent = mailOptions.html;
    sendSmtpEmail.sender = { 
      email: process.env.BREVO_EMAIL, 
      name: 'The Bar - Sistema de Gestión' 
    };
    sendSmtpEmail.to = [{ email: mailOptions.to }];

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('Correo enviado:', response.messageId);
    return response;
  } catch (error) {
    console.error('Error enviando correo:', error.message);
    throw error;
  }
};

module.exports = { sendMail };