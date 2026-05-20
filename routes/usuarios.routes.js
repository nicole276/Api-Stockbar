// routes/usuarios.routes.js
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authenticateJWT');
const checkModuleAccess = require('../middlewares/checkModuleAccess');
const usuariosController = require('../controllers/usuarios.controller');

// Rutas para usuarios
router.get('/', authenticateJWT, checkModuleAccess('USUARIOS'), usuariosController.getUsuarios);
router.get('/:id', authenticateJWT, checkModuleAccess('USUARIOS'), usuariosController.getUsuarioById);
router.post('/', authenticateJWT, checkModuleAccess('USUARIOS'), usuariosController.createUsuario);
router.put('/:id', authenticateJWT, checkModuleAccess('USUARIOS'), usuariosController.updateUsuario);
router.patch('/:id/estado', authenticateJWT, checkModuleAccess('USUARIOS'), usuariosController.changeUsuarioStatus);
router.delete('/:id', authenticateJWT, checkModuleAccess('USUARIOS'), usuariosController.deleteUsuario);

module.exports = router;