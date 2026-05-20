// routes/pedidos.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const pedidosController = require('../controllers/pedidos.controller');

router.get('/', authenticateJWT, checkModuleAccess('PEDIDOS'), pedidosController.getPedidos);
router.get('/:id', authenticateJWT, checkModuleAccess('PEDIDOS'), pedidosController.getPedidoById);
router.post('/', authenticateJWT, checkModuleAccess('PEDIDOS'), pedidosController.createPedido);
router.put('/:id', authenticateJWT, checkModuleAccess('PEDIDOS'), pedidosController.updatePedido);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('PEDIDOS'), pedidosController.completePedido);

module.exports = router;