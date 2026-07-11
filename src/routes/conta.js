// Rotas da CONTA DE CLIENTE (app do marketplace). Sessão própria, separada da
// equipe. A autenticação (cadastro/login) é pública; o app em si exige a conta.
const express = require('express');
const router = express.Router();
const auth = require('../controllers/contaClienteController');
const app = require('../controllers/appClienteController');
const { exigeContaCliente } = require('../middlewares/auth');

// --- Autenticação (público) ---
router.get('/entrar', auth.mostrarLogin);
router.post('/entrar', auth.login);
router.get('/cadastro', auth.mostrarCadastro);
router.post('/cadastro', auth.cadastrar);
router.post('/sair', auth.logout);

// --- App (exige conta logada) ---
router.use(exigeContaCliente);

router.get('/', app.home);
router.get('/busca', app.busca);
router.get('/agendamentos', app.agendamentos);
router.get('/perfil', app.perfil);
router.get('/agendamento/:id', app.agendamentoDetalhe);
router.get('/b/:slug', app.barbearia);
router.get('/b/:slug/agendar', app.agendar);
router.post('/b/:slug/agendar', app.confirmar);

module.exports = router;
