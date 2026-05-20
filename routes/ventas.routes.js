// routes/ventas.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const ventasController = require('../controllers/ventas.controller');

router.get('/', authenticateJWT, checkModuleAccess('VENTAS'), ventasController.getVentas);
router.get('/:id', authenticateJWT, checkModuleAccess('VENTAS'), ventasController.getVentaById);
router.post('/', authenticateJWT, checkModuleAccess('VENTAS'), ventasController.createVentaDirecta);

module.exports = router;