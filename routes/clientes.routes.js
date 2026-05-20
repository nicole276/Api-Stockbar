// routes/clientes.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const clientesController = require('../controllers/clientes.controller');

router.get('/', authenticateJWT, checkModuleAccess('CLIENTES'), clientesController.getClientes);
router.get('/:id', authenticateJWT, checkModuleAccess('CLIENTES'), clientesController.getClienteById);
router.post('/', authenticateJWT, checkModuleAccess('CLIENTES'), clientesController.createCliente);
router.put('/:id', authenticateJWT, checkModuleAccess('CLIENTES'), clientesController.updateCliente);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('CLIENTES'), clientesController.changeEstadoCliente);
router.delete('/:id', authenticateJWT, checkModuleAccess('CLIENTES'), clientesController.deleteCliente);

module.exports = router;