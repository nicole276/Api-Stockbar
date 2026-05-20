// controllers/categorias.controller.js
const pool = require('../config/database');

// GET /api/categorias - Listar categorías
exports.getCategorias = async (req, res) => {
  try {
    const { search, estado } = req.query;
    let query = 'SELECT * FROM categorias WHERE 1=1';
    const params = []; 
    let n = 1;
    
    if (search) { 
      query += ` AND (nombre ILIKE $${n} OR descripcion ILIKE $${n})`; 
      params.push(`%${search}%`); 
      n++; 
    }
    if (estado !== undefined) { 
      query += ` AND estado=$${n}`; 
      params.push(parseInt(estado)); 
      n++; 
    }
    query += ' ORDER BY id_categoria DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error listando categorías'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// GET /api/categorias/:id - Obtener una categoría
exports.getCategoriaById = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM categorias WHERE id_categoria=$1', [req.params.id]);
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error obteniendo categoría'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// POST /api/categorias - Crear categoría
exports.createCategoria = async (req, res) => {
  try {
    const { nombre, descripcion, estado = 1 } = req.body;
    if (!nombre) 
      return res.status(400).json({ success: false, message: 'Nombre requerido' });
    
    const r = await pool.query(
      'INSERT INTO categorias (nombre, descripcion, estado) VALUES ($1, $2, $3) RETURNING *',
      [nombre, descripcion, estado]
    );
    res.status(201).json({ success: true, message: 'Categoría creada', data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error creando categoría'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// PUT /api/categorias/:id - Actualizar categoría
exports.updateCategoria = async (req, res) => {
  try {
    const { nombre, descripcion, estado } = req.body;
    const r = await pool.query(
      'UPDATE categorias SET nombre=$1, descripcion=$2, estado=$3 WHERE id_categoria=$4 RETURNING *',
      [nombre, descripcion, estado, req.params.id]
    );
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    res.json({ success: true, message: 'Categoría actualizada', data: r.rows[0] });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error actualizando categoría'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// PATCH /api/categorias/:id/estado - Cambiar estado
exports.changeEstadoCategoria = async (req, res) => {
  try {
    const { estado } = req.body;
    
    if (estado === 0 || estado === '0') {
      const prods = await pool.query(
        'SELECT COUNT(*) as c FROM productos WHERE id_categoria=$1 AND estado=1', 
        [req.params.id]
      );
      if (parseInt(prods.rows[0].c) > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se puede desactivar: tiene productos activos asociados' 
        });
      }
    }
    
    const r = await pool.query(
      'UPDATE categorias SET estado=$1 WHERE id_categoria=$2 RETURNING *', 
      [estado, req.params.id]
    );
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    
    res.json({ 
      success: true, 
      message: `Categoría ${estado == 1 ? 'activada' : 'desactivada'}`, 
      data: r.rows[0] 
    });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error cambiando estado'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};

// DELETE /api/categorias/:id - Eliminar categoría
exports.deleteCategoria = async (req, res) => {
  try {
    const prods = await pool.query(
      'SELECT COUNT(*) as c FROM productos WHERE id_categoria=$1 AND estado=1', 
      [req.params.id]
    );
    if (parseInt(prods.rows[0].c) > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No se puede eliminar: tiene productos activos asociados' 
      });
    }
    
    const r = await pool.query(
      'DELETE FROM categorias WHERE id_categoria=$1 RETURNING *', 
      [req.params.id]
    );
    if (r.rows.length === 0) 
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    
    res.json({ success: true, message: 'Categoría eliminada' });
  } catch (e) { 
    const msg = e.message?.includes('duplicate') ? 'Ya existe un registro con esos datos' 
             : e.message?.includes('foreign key') ? 'No se puede realizar esta operación porque tiene registros asociados' 
             : 'Error eliminando categoría'; 
    res.status(500).json({ success: false, message: msg }); 
  }
};