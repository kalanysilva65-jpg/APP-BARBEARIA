// Secretária Cortavo — CONFIGURAÇÃO (o dono ajusta modo, link, regras e tetos) e
// o CHAT DE TESTE (etapa 3.1, calibrar as respostas antes de ligar o WhatsApp).
// Tudo só admin.
const secretaria = require('../services/secretaria');
const prisma = require('../config/db');

// Chaves de configuração da secretária (na tabela Configuracao, por barbearia).
const CHAVES = ['secretaria_modo', 'secretaria_link', 'secretaria_regras', 'secretaria_teto_mes', 'copiloto_teto_mes', 'secretaria_privacidade_link'];

const MAX_MSG = 1000;
const MAX_HIST = 12;
const MAX_HIST_TXT = 2000;

function modoValido(m) {
  return m === 'terceiros' ? 'terceiros' : 'cortavo';
}

// Monta o contexto da secretária a partir da sessão (escopo forçado) + o modo.
function contextoDe(req, res, modo) {
  const b = res.locals.barbeariaAtual;
  return {
    barbeariaId: req.barbeariaId,
    modo,
    nomeBarbearia: b ? b.nome : 'a barbearia',
    // CHAT DE TESTE: nunca grava de verdade (criar_agendamento só simula), para
    // não sujar a agenda real da barbearia.
    permitirAgendar: false,
    // No modo terceiros, o link de agendamento do outro app viria da config da
    // barbearia. Aqui, no teste, um link de exemplo.
    config: { linkAgendamento: b && b.slug ? `https://agenda.exemplo.com/${b.slug}` : null },
  };
}

// GET /painel/secretaria/teste
function verTeste(req, res) {
  const modo = modoValido(req.query.modo);
  res.render('painel/secretaria-teste', {
    titulo: 'Secretária (teste)',
    iaAtiva: secretaria.habilitada(),
    modo,
  });
}

// POST /painel/secretaria/teste/mensagem
async function mensagemTeste(req, res) {
  if (!secretaria.habilitada()) {
    return res.status(503).json({ erro: 'A secretária ainda não está configurada (falta a chave da IA).' });
  }
  const modo = modoValido(req.body.modo);
  const texto = String(req.body.mensagem || '').trim().slice(0, MAX_MSG);
  if (!texto) return res.status(400).json({ erro: 'Escreva uma mensagem.' });

  const histBruto = Array.isArray(req.body.historico) ? req.body.historico : [];
  const mensagens = histBruto
    .filter((m) => m && (m.papel === 'user' || m.papel === 'assistant') && typeof m.texto === 'string')
    .slice(-MAX_HIST)
    .map((m) => ({ role: m.papel, content: m.texto.slice(0, MAX_HIST_TXT) }));
  mensagens.push({ role: 'user', content: texto });

  try {
    const { texto: resposta } = await secretaria.responder(contextoDe(req, res, modo), mensagens);
    res.json({ resposta });
  } catch (e) {
    console.error('[secretaria] falha ao responder:', e.message);
    res.status(500).json({ erro: 'Não consegui responder agora. Tente de novo.' });
  }
}

// GET /painel/secretaria — tela de configuração da secretária.
async function verConfig(req, res) {
  const regs = await prisma.configuracao.findMany({ where: { barbeariaId: req.barbeariaId, chave: { in: CHAVES } } });
  const cfg = Object.fromEntries(regs.map((r) => [r.chave, r.valor]));
  res.render('painel/secretaria-config', {
    titulo: 'Secretária',
    cfg: {
      modo: cfg.secretaria_modo === 'terceiros' ? 'terceiros' : 'cortavo',
      link: cfg.secretaria_link || '',
      regras: cfg.secretaria_regras || '',
      tetoMes: cfg.secretaria_teto_mes || '',
      copilotoTetoMes: cfg.copiloto_teto_mes || '',
      privacidadeLink: cfg.secretaria_privacidade_link || '',
    },
  });
}

// POST /painel/secretaria — salva a configuração.
async function salvarConfig(req, res) {
  const b = req.barbeariaId;
  const soDigitos = (v) => String(v || '').replace(/\D/g, '');
  const valores = {
    secretaria_modo: modoValido(req.body.modo),
    secretaria_link: String(req.body.link || '').trim().slice(0, 500),
    secretaria_regras: String(req.body.regras || '').trim().slice(0, 1500),
    secretaria_teto_mes: soDigitos(req.body.tetoMes),
    copiloto_teto_mes: soDigitos(req.body.copilotoTetoMes),
    secretaria_privacidade_link: String(req.body.privacidadeLink || '').trim().slice(0, 500),
  };
  for (const [chave, valor] of Object.entries(valores)) {
    await prisma.configuracao.upsert({
      where: { barbeariaId_chave: { barbeariaId: b, chave } },
      update: { valor },
      create: { barbeariaId: b, chave, valor },
    });
  }
  req.session.flash = { tipo: 'sucesso', texto: 'Configuração da secretária salva.' };
  res.redirect('/painel/secretaria');
}

module.exports = { verConfig, salvarConfig, verTeste, mensagemTeste };
