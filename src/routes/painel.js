// Rotas internas (painel da equipe). Tudo aqui exige login.
const express = require('express');
const router = express.Router();
const { exigeLogin, exigeAdmin } = require('../middlewares/auth');
const prisma = require('../config/db');
const agendaController = require('../controllers/agendaController');
const horarioController = require('../controllers/horarioController');
const servicoController = require('../controllers/servicoController');
const upload = require('../middlewares/upload');

// Envolve o upload do multer para tratar erros (tamanho/formato) com mensagem amigável.
function uploadFoto(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      req.session.flash = { tipo: 'erro', texto: err.message || 'Falha no upload da imagem.' };
      return res.redirect('/painel/servicos');
    }
    next();
  });
}

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

// --- Serviços & Produtos (somente admin) ----------------------------------
// IMPORTANTE: rotas específicas (/novo, /categorias) vêm ANTES das paramétricas (/:id).
router.get('/servicos', exigeAdmin, servicoController.listar);
router.get('/servicos/novo', exigeAdmin, servicoController.formNovo);
router.post('/servicos', exigeAdmin, uploadFoto, servicoController.criar);
// Categorias do catálogo
router.post('/servicos/categorias', exigeAdmin, servicoController.criarCategoria);
router.post('/servicos/categorias/:id/remover', exigeAdmin, servicoController.removerCategoria);
router.post('/servicos/categorias/:id', exigeAdmin, servicoController.renomearCategoria);
// Serviço específico
router.get('/servicos/:id/editar', exigeAdmin, servicoController.formEditar);
router.post('/servicos/:id/toggle', exigeAdmin, servicoController.alternarAtivo);
router.post('/servicos/:id/remover', exigeAdmin, servicoController.remover);
router.post('/servicos/:id', exigeAdmin, uploadFoto, servicoController.atualizar);

// --- Stubs das próximas fases ---------------------------------------------
function emBreve(titulo, fase) {
  return (req, res) => res.render('painel/em-breve', { titulo, fase });
}
router.get('/estoque', exigeAdmin, emBreve('Estoque', 'Fase 5'));
router.get('/caixa', exigeAdmin, emBreve('Caixa', 'Fase 6'));

module.exports = router;
