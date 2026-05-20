// routes/categorias.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const categoriasController = require('../controllers/categorias.controller');

router.get('/', authenticateJWT, checkModuleAccess('CATEGORIAS'), categoriasController.getCategorias);
router.get('/:id', authenticateJWT, checkModuleAccess('CATEGORIAS'), categoriasController.getCategoriaById);
router.post('/', authenticateJWT, checkModuleAccess('CATEGORIAS'), categoriasController.createCategoria);
router.put('/:id', authenticateJWT, checkModuleAccess('CATEGORIAS'), categoriasController.updateCategoria);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('CATEGORIAS'), categoriasController.changeEstadoCategoria);
router.delete('/:id', authenticateJWT, checkModuleAccess('CATEGORIAS'), categoriasController.deleteCategoria);

module.exports = router;