// Rotas internas (painel da equipe). Tudo aqui exige login.
const express = require('express');
const router = express.Router();
const { exigeLogin, exigeAdmin } = require('../middlewares/auth');
const prisma = require('../config/db');
const agendaController = require('../controllers/agendaController');
const horarioController = require('../controllers/horarioController');
const servicoController = require('../controllers/servicoController');
const estoqueController = require('../controllers/estoqueController');
const caixaController = require('../controllers/caixaController');
const comissaoController = require('../controllers/comissaoController');
const clienteController = require('../controllers/clienteController');
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
router.post('/agenda/:id/excluir', agendaController.excluir);

// --- Clientes (admin + funcionários) --------------------------------------
// Específicas (/:id/editar, /:id/remover) antes da paramétrica de update (/:id).
router.get('/clientes', clienteController.listar);
router.get('/clientes/:id/editar', clienteController.formEditar);
router.get('/clientes/:id', clienteController.detalhe); // histórico do cliente
router.post('/clientes', clienteController.criar);
router.post('/clientes/:id/remover', clienteController.remover);
router.post('/clientes/:id', clienteController.atualizar);

// --- Comissões (somente admin) --------------------------------------------
router.get('/comissoes', exigeAdmin, comissaoController.ver);
router.post('/comissoes/percentual/:id', exigeAdmin, comissaoController.salvarPercentual);

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

// --- Estoque (somente admin) ----------------------------------------------
// Específicas (/novo, /categorias) antes das paramétricas (/:id).
router.get('/estoque', exigeAdmin, estoqueController.listar);
router.get('/estoque/novo', exigeAdmin, estoqueController.formNovo);
router.post('/estoque', exigeAdmin, estoqueController.criar);
router.post('/estoque/categorias', exigeAdmin, estoqueController.criarCategoria);
router.post('/estoque/categorias/:id/remover', exigeAdmin, estoqueController.removerCategoria);
router.post('/estoque/categorias/:id', exigeAdmin, estoqueController.renomearCategoria);
router.get('/estoque/:id/editar', exigeAdmin, estoqueController.formEditar);
router.post('/estoque/:id/ajuste', exigeAdmin, estoqueController.ajustar);
router.post('/estoque/:id/remover', exigeAdmin, estoqueController.remover);
router.post('/estoque/:id', exigeAdmin, estoqueController.atualizar);

// --- Caixa (somente admin) ------------------------------------------------
// Específicas (/config, /categorias) antes das paramétricas (/:id).
router.get('/caixa', exigeAdmin, caixaController.ver);
router.post('/caixa', exigeAdmin, caixaController.criar);
router.post('/caixa/config', exigeAdmin, caixaController.alternarAutomatico);
router.post('/caixa/categorias', exigeAdmin, caixaController.criarCategoria);
router.post('/caixa/categorias/:id/remover', exigeAdmin, caixaController.removerCategoria);
router.post('/caixa/categorias/:id', exigeAdmin, caixaController.atualizarCategoria);
router.post('/caixa/:id/remover', exigeAdmin, caixaController.remover);

module.exports = router;
