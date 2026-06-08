// middlewares/checkModuleAccess.js
const pool = require('../config/database');

const checkModuleAccess = (moduleName) => async (req, res, next) => {
  try {
    // 👑 Admin (rol 1) tiene acceso total
    if (req.user.id_rol === 1) return next();
    
    const result = await pool.query(`
      SELECT p.nombre
      FROM permisos p
      JOIN ver_detalle_rol vdr ON p.id_permiso = vdr.id_permiso
      WHERE vdr.id_rol = $1 AND p.estado = 1
    `, [req.user.id_rol]);
    
    const modulos = result.rows.map(r => r.nombre);
    
    if (!modulos.includes(moduleName)) {
      return res.status(403).json({ 
        success: false, 
        message: `Sin permiso para: ${moduleName}` 
      });
    }
    
    // 🔒 Solo admin puede eliminar ventas/compras
    if (['REALIZAR_VENTAS','REALIZAR_COMPRAS'].includes(moduleName) && req.method === 'DELETE') {
      return res.status(403).json({ 
        success: false, 
        message: 'Solo el administrador puede eliminar ventas y compras' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Error permisos:', error);
    res.status(500).json({ success: false, message: 'Error al verificar permisos' });
  }
};

module.exports = checkModuleAccess;