// routes/roles.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const rolesController = require('../controllers/roles.controller');

// Rutas para roles
router.get('/', authenticateJWT, checkModuleAccess('ROLES'), rolesController.getRoles);
router.get('/:id', authenticateJWT, checkModuleAccess('ROLES'), rolesController.getRoleById);
router.post('/', authenticateJWT, checkModuleAccess('ROLES'), rolesController.createRole);
router.put('/:id', authenticateJWT, checkModuleAccess('ROLES'), rolesController.updateRole);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('ROLES'), rolesController.changeRoleStatus);
router.delete('/:id', authenticateJWT, checkModuleAccess('ROLES'), rolesController.deleteRole);

module.exports = router;