// routes/proveedores.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const proveedoresController = require('../controllers/proveedores.controller');

router.get('/', authenticateJWT, checkModuleAccess('PROVEEDORES'), proveedoresController.getProveedores);
router.get('/:id', authenticateJWT, checkModuleAccess('PROVEEDORES'), proveedoresController.getProveedorById);
router.post('/', authenticateJWT, checkModuleAccess('PROVEEDORES'), proveedoresController.createProveedor);
router.put('/:id', authenticateJWT, checkModuleAccess('PROVEEDORES'), proveedoresController.updateProveedor);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('PROVEEDORES'), proveedoresController.changeEstadoProveedor);
router.delete('/:id', authenticateJWT, checkModuleAccess('PROVEEDORES'), proveedoresController.deleteProveedor);

module.exports = router;