// controllers/permisos.controller.js
const pool = require('../config/database');

exports.getPermisos = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM permisos ORDER BY nombre');
    res.json({ success: true, data: result.rows });
  } catch (e) {
    const msg = e.message?.includes('duplicate') 
      ? 'Ya existe un registro con esos datos' 
      : e.message?.includes('foreign key') 
        ? 'No se puede realizar esta operación porque tiene registros asociados' 
        : 'Error obteniendo permisos'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};