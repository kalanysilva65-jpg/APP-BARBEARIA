// Rotas internas (painel da equipe). Tudo aqui exige login.
const express = require('express');
const router = express.Router();
const { exigeLogin, exigeAdmin } = require('../middlewares/auth');
const { exigeBarbeariaPainel } = require('../middlewares/tenant');
const prisma = require('../config/db');
const agendaController = require('../controllers/agendaController');
const horarioController = require('../controllers/horarioController');
const servicoController = require('../controllers/servicoController');
const estoqueController = require('../controllers/estoqueController');
const caixaController = require('../controllers/caixaController');
const comissaoController = require('../controllers/comissaoController');
const clienteController = require('../controllers/clienteController');
const planoController = require('../controllers/planoController');
const dashboardController = require('../controllers/dashboardController');
const perfilController = require('../controllers/perfilController');
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

// Upload da foto do próprio usuário logado (hero do painel).
function uploadFotoPerfil(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      req.session.flash = { tipo: 'erro', texto: err.message || 'Falha no upload da imagem.' };
      return res.redirect(req.get('Referer') || '/painel');
    }
    next();
  });
}

// Upload da foto do barbeiro (volta para a tela de Equipe/Comissões em caso de erro).
function uploadFotoBarbeiro(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      req.session.flash = { tipo: 'erro', texto: err.message || 'Falha no upload da foto.' };
      return res.redirect('/painel/comissoes');
    }
    next();
  });
}

// Tudo abaixo exige usuário logado E uma barbearia no contexto.
router.use(exigeLogin);
router.use(exigeBarbeariaPainel);

// "Qui, 3 jul" — usado no subtítulo constante do cabeçalho do painel.
const DIAS_SEMANA_ABR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatarDataCabecalho(d) {
  return `${DIAS_SEMANA_ABR[d.getDay()]}, ${d.getDate()} ${MESES_ABR[d.getMonth()]}`;
}

// Define o "papel efetivo": o dono, ao entrar numa barbearia, age como admin dela.
// Também carrega a barbearia ativa (nome) para o cabeçalho / banner do dono.
router.use(async (req, res, next) => {
  const u = req.session.usuario;
  req.ehAdmin = u.papel === 'admin' || u.papel === 'dono';
  res.locals.ehAdmin = req.ehAdmin;
  res.locals.ehDono = u.papel === 'dono';
  const barbearia = await prisma.barbearia.findUnique({ where: { id: req.barbeariaId } });
  res.locals.barbeariaAtual = barbearia || null;
  const usuarioDb = await prisma.usuario.findUnique({ where: { id: u.id } });
  res.locals.usuarioFotoUrl = usuarioDb ? usuarioDb.fotoUrl : null;
  res.locals.usuarioPrimeiroNome = (u.nome || '').split(' ')[0];
  res.locals.hojeFormatado = formatarDataCabecalho(new Date());

  // Alerta de estoque baixo (admin) — mostrado no subtítulo do cabeçalho em todas as telas.
  res.locals.estoqueBaixoCount = 0;
  if (req.ehAdmin) {
    const itens = await prisma.estoque.findMany({ where: { barbeariaId: req.barbeariaId } });
    res.locals.estoqueBaixoCount = itens.filter((i) => i.quantidade <= i.quantidadeMinima).length;
  }
  next();
});

// Painel (dashboard).
router.get('/', dashboardController.ver);

// Foto do próprio usuário logado (hero do painel).
router.post('/perfil/foto', uploadFotoPerfil, perfilController.salvarFoto);

// "Mais" — menu com as demais seções (acesso pela navegação inferior).
router.get('/mais', perfilController.ver);

// --- Agenda (todos: funcionário vê a sua, admin vê todas) -----------------
router.get('/agenda', agendaController.verAgenda);
router.get('/agenda/horarios', agendaController.horariosJson); // JSON p/ o pop-up "Novo agendamento"
router.get('/agenda/novo', agendaController.formNovo); // agendamento manual
router.post('/agenda/novo', agendaController.criarManual);
router.post('/agenda/:id/itens', agendaController.adicionarItem);
router.post('/agenda/itens/:id/remover', agendaController.removerItem);
router.post('/agenda/:id/status', agendaController.mudarStatus);
router.post('/agenda/:id/excluir', agendaController.excluir);
// Bloqueios direto da agenda: barbeiro bloqueia a PRÓPRIA agenda (escopado no controller).
router.post('/agenda/bloqueios', agendaController.criarBloqueio);
router.post('/agenda/bloqueios/:id/remover', agendaController.removerBloqueio);

// --- Clientes (admin + funcionários) --------------------------------------
// Específicas (/:id/editar, /:id/remover) antes da paramétrica de update (/:id).
router.get('/clientes', clienteController.listar);
router.get('/clientes/:id/editar', clienteController.formEditar);
router.get('/clientes/:id', clienteController.detalhe); // histórico do cliente
router.post('/clientes/planos/:id/remover', clienteController.removerPlano);
router.post('/clientes/:id/planos', clienteController.adicionarPlano);
router.post('/clientes', clienteController.criar);
router.post('/clientes/:id/remover', clienteController.remover);
router.post('/clientes/:id', clienteController.atualizar);

// --- Planos: ver para todos; criar/editar só admin ------------------------
router.get('/planos', planoController.listar);
router.get('/planos/novo', exigeAdmin, planoController.formNovo);
router.post('/planos', exigeAdmin, planoController.criar);
router.get('/planos/:id/editar', exigeAdmin, planoController.formEditar);
router.post('/planos/:id/toggle', exigeAdmin, planoController.alternarAtivo);
router.post('/planos/:id/remover', exigeAdmin, planoController.remover);
router.post('/planos/:id', exigeAdmin, planoController.atualizar);

// --- Equipe / Comissões ----------------------------------------------------
// Barbeiro vê SÓ a comissão dele (escopado no controller). Editar a % e trocar
// a foto de barbeiros continua sendo exclusivo do admin.
router.get('/comissoes', comissaoController.ver);
router.post('/comissoes/percentual/:id', exigeAdmin, comissaoController.salvarPercentual);
router.post('/comissoes/:id/foto', exigeAdmin, uploadFotoBarbeiro, comissaoController.salvarFoto);

// --- Horários & bloqueios --------------------------------------------------
// Barbeiro edita a PRÓPRIA jornada e os PRÓPRIOS bloqueios (escopado no
// controller). A janela de agendamento é da barbearia toda: só admin.
router.get('/horarios', horarioController.ver);
router.post('/horarios/jornada', horarioController.salvarJornada);
router.post('/horarios/bloqueios', horarioController.adicionarBloqueio);
router.post('/horarios/bloqueios/:id/remover', horarioController.removerBloqueio);
router.post('/horarios/janela', exigeAdmin, horarioController.salvarJanela);

// --- Serviços & Produtos (admin + barbeiros) ------------------------------
// IMPORTANTE: rotas específicas (/novo, /categorias) vêm ANTES das paramétricas (/:id).
router.get('/servicos', servicoController.listar);
router.get('/servicos/novo', servicoController.formNovo);
router.post('/servicos', uploadFoto, servicoController.criar);
// Categorias do catálogo
router.post('/servicos/categorias', servicoController.criarCategoria);
router.post('/servicos/categorias/:id/remover', servicoController.removerCategoria);
router.post('/servicos/categorias/:id', servicoController.renomearCategoria);
// Serviço específico
router.get('/servicos/:id/editar', servicoController.formEditar);
router.post('/servicos/:id/toggle', servicoController.alternarAtivo);
router.post('/servicos/:id/remover', servicoController.remover);
router.post('/servicos/:id', uploadFoto, servicoController.atualizar);

// --- Estoque (admin + barbeiros) ------------------------------------------
// Específicas (/novo, /categorias) antes das paramétricas (/:id).
router.get('/estoque', estoqueController.listar);
router.get('/estoque/novo', estoqueController.formNovo);
router.post('/estoque', estoqueController.criar);
router.post('/estoque/categorias', estoqueController.criarCategoria);
router.post('/estoque/categorias/:id/remover', estoqueController.removerCategoria);
router.post('/estoque/categorias/:id', estoqueController.renomearCategoria);
router.get('/estoque/:id/editar', estoqueController.formEditar);
router.post('/estoque/:id/ajuste', estoqueController.ajustar);
router.post('/estoque/:id/remover', estoqueController.remover);
router.post('/estoque/:id', estoqueController.atualizar);

// Equipe (barbeiros) e Marca são gerenciadas apenas no painel-mestre (dono do
// sistema), em /mestre/barbearias/:id — por isso não há rotas delas aqui.

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
