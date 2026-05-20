// middlewares/authenticateJWT.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { JWT_SECRET } = require('../config/jwt');

const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token requerido' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id_usuario = $1 AND estado = 1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario inactivo o no válido' });
    }
    
    req.user = { ...result.rows[0], userId: decoded.userId, roleId: decoded.roleId };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') 
      return res.status(401).json({ success: false, message: 'Token expirado' });
    if (error.name === 'JsonWebTokenError') 
      return res.status(401).json({ success: false, message: 'Token inválido' });
    
    console.error('❌ Error autenticación:', error);
    res.status(500).json({ success: false, message: 'Error en autenticación' });
  }
};

module.exports = authenticateJWT;