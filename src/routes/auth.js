// Rotas de autenticação e entrada do app.
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Raiz: equipe logada vai para o painel; visitante (cliente) vai para o agendamento.
router.get('/', (req, res) => res.redirect(req.session.usuario ? '/painel' : '/agendar'));

router.get('/login', authController.mostrarLogin);
router.post('/login', authController.fazerLogin);
router.post('/logout', authController.logout);

module.exports = router;
