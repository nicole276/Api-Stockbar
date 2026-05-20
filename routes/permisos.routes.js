// routes/permisos.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const permisosController = require('../controllers/permisos.controller');

// Ruta GET para listar permisos
router.get('/', authenticateJWT, checkModuleAccess('ROLES'), permisosController.getPermisos);

module.exports = router;