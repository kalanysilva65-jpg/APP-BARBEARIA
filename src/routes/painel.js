// Rotas internas (painel da equipe). Tudo aqui exige login.
const express = require('express');
const router = express.Router();
const { exigeLogin, exigeAdmin } = require('../middlewares/auth');
const prisma = require('../config/db');
const agendaController = require('../controllers/agendaController');
const horarioController = require('../controllers/horarioController');

// Tudo abaixo exige usuário logado.
router.use(exigeLogin);

// Painel (dashboard).
router.get('/', async (req, res) => {
  // Alerta de estoque baixo visível para o admin.
  let estoqueBaixo = [];
  if (req.session.usuario.papel === 'admin') {
    const itens = await prisma.estoque.findMany();
    estoqueBaixo = itens.filter((i) => i.quantidade <= i.quantidadeMinima);
  }
  res.render('painel/dashboard', { titulo: 'Painel', estoqueBaixo });
});

// --- Agenda (todos: funcionário vê a sua, admin vê todas) -----------------
router.get('/agenda', agendaController.verAgenda);
router.post('/agenda/:id/itens', agendaController.adicionarItem);
router.post('/agenda/itens/:id/remover', agendaController.removerItem);
router.post('/agenda/:id/status', agendaController.mudarStatus);

// --- Horários & bloqueios (somente admin) ---------------------------------
router.get('/horarios', exigeAdmin, horarioController.ver);
router.post('/horarios/jornada', exigeAdmin, horarioController.salvarJornada);
router.post('/horarios/bloqueios', exigeAdmin, horarioController.adicionarBloqueio);
router.post('/horarios/bloqueios/:id/remover', exigeAdmin, horarioController.removerBloqueio);

// --- Stubs das próximas fases ---------------------------------------------
function emBreve(titulo, fase) {
  return (req, res) => res.render('painel/em-breve', { titulo, fase });
}
router.get('/servicos', exigeAdmin, emBreve('Serviços & Produtos', 'Fase 4'));
router.get('/estoque', exigeAdmin, emBreve('Estoque', 'Fase 5'));
router.get('/caixa', exigeAdmin, emBreve('Caixa', 'Fase 6'));

module.exports = router;
