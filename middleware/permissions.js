const pool = require('../db');

const checkModuleAccess = (moduleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          success: false,
          message: 'No autenticado'
        });
      }

      const userId = req.user.userId;

      // Obtener permisos del usuario
      const result = await pool.query(`
        SELECT p.nombre AS nombre_modulo, 'read' AS nombre_permiso
        FROM permisos p
        JOIN ver_detalle_rol vdr ON p.id_permiso = vdr.id_permiso
        WHERE vdr.id_rol = $1 AND p.estado = 1
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos asignados. Contacta al administrador'
        });
      }

      const userModules = result.rows.map(p => p.nombre_modulo);

      // Verificar acceso al módulo
      if (!userModules.includes(moduleName)) {
        return res.status(403).json({
          success: false,
          message: `Acceso denegado: No tienes permisos para el módulo "${moduleName}"`
        });
      }

      // Solo admin (rol_id = 1) puede eliminar ventas/compras
      if (['ventas', 'compras'].includes(moduleName) && req.method === 'DELETE') {
        if (req.user.roleId !== 1) {
          return res.status(403).json({
            success: false,
            message: '🚫 Solo el administrador puede eliminar ventas y compras'
          });
        }
      }

      req.user.permissions = result.rows;
      next();
    } catch (error) {
      console.error('Error verificando permisos:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar permisos'
      });
    }
  };
};

module.exports = { checkModuleAccess };