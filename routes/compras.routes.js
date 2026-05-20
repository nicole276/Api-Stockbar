// routes/compras.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const comprasController = require('../controllers/compras.controller');

router.get('/', authenticateJWT, checkModuleAccess('COMPRAS'), comprasController.getCompras);
router.get('/:id', authenticateJWT, checkModuleAccess('COMPRAS'), comprasController.getCompraById);
router.post('/', authenticateJWT, checkModuleAccess('COMPRAS'), comprasController.createCompra);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('COMPRAS'), comprasController.changeEstadoCompra);
router.delete('/:id', authenticateJWT, checkModuleAccess('COMPRAS'), comprasController.deleteCompra);

module.exports = router;