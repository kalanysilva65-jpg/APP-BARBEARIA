// Rotas de autenticação e entrada do app.
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Raiz: manda para o painel (se logado) ou para o login.
router.get('/', (req, res) => res.redirect(req.session.usuario ? '/painel' : '/login'));

router.get('/login', authController.mostrarLogin);
router.post('/login', authController.fazerLogin);
router.post('/logout', authController.logout);

module.exports = router;
