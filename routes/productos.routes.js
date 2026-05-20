// routes/productos.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const productosController = require('../controllers/productos.controller');

router.get('/', authenticateJWT, checkModuleAccess('PRODUCTOS'), productosController.getProductos);
router.get('/:id', authenticateJWT, checkModuleAccess('PRODUCTOS'), productosController.getProductoById);
router.post('/', authenticateJWT, checkModuleAccess('PRODUCTOS'), productosController.createProducto);
router.put('/:id', authenticateJWT, checkModuleAccess('PRODUCTOS'), productosController.updateProducto);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('PRODUCTOS'), productosController.changeEstadoProducto);
router.delete('/:id', authenticateJWT, checkModuleAccess('PRODUCTOS'), productosController.deleteProducto);

module.exports = router;