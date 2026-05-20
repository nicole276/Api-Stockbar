// routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const dashboardController = require('../controllers/dashboard.controller');

router.get('/stats', authenticateJWT, checkModuleAccess('DASHBOARD'), dashboardController.getStats);
router.get('/ventas-chart', authenticateJWT, checkModuleAccess('DASHBOARD'), dashboardController.getVentasChart);
router.get('/productos-populares', authenticateJWT, checkModuleAccess('DASHBOARD'), dashboardController.getProductosPopulares);
router.get('/reporte-financiero', authenticateJWT, checkModuleAccess('DASHBOARD'), dashboardController.getReporteFinanciero);

module.exports = router;