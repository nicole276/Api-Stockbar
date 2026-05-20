// config/jwt.js
module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'the-bar-super-secret-key-2026',
  JWT_EXPIRES_IN: '30d'
};