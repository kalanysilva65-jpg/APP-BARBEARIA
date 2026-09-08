// Secretária Cortavo — CHAT DE TESTE (etapa 3.1). Deixa o dono conversar com a
// secretária pelo navegador, como se fosse o cliente no WhatsApp, para calibrar
// as respostas nos dois modos ANTES de ligar o WhatsApp de verdade. Só admin.
const secretaria = require('../services/secretaria');

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
    // No modo terceiros, o link de agendamento do outro app viria da config da
    // barbearia (a persistir na 3.2). Aqui, no teste, um link de exemplo.
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

module.exports = { verTeste, mensagemTeste };
