// Rotas da CONTA DE CLIENTE (app do marketplace). Sessão própria, separada da
// equipe. Aqui mora só a autenticação (Fase 0); as telas do app (home, busca,
// agendamento, agendamentos, perfil) entram nas fases seguintes.
const express = require('express');
const router = express.Router();
const c = require('../controllers/contaClienteController');
const { exigeContaCliente } = require('../middlewares/auth');

router.get('/entrar', c.mostrarLogin);
router.post('/entrar', c.login);
router.get('/cadastro', c.mostrarCadastro);
router.post('/cadastro', c.cadastrar);
router.post('/sair', c.logout);

// Área logada do cliente.
router.get('/', exigeContaCliente, c.inicio);

module.exports = router;
