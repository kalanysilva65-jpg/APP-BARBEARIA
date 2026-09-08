// Assistente Cortavo (aba /painel/ia). Tela de conversa + endpoint que roda o
// laço da IA. O escopo (barbearia e, se barbeiro, o próprio usuário) sai SEMPRE
// da sessão — nunca do corpo da requisição.
const ia = require('../services/ia');

const MAX_MSG = 1000; // tamanho máx. da pergunta do usuário
const MAX_HIST = 10; // últimas N mensagens do histórico que reenviamos
const MAX_HIST_TXT = 2000; // corte por mensagem do histórico

// Monta o contexto de escopo a partir da sessão. Admin/dono => barbearia toda
// (usuarioId null); barbeiro (funcionário) => só os próprios dados.
function contextoDe(req) {
  return {
    barbeariaId: req.barbeariaId,
    usuarioId: req.ehAdmin ? null : req.session.usuario.id,
  };
}

// GET /painel/ia — tela do assistente.
function ver(req, res) {
  res.render('painel/ia', {
    titulo: 'Assistente',
    iaAtiva: ia.iaHabilitada(),
    primeiroNome: (req.session.usuario.nome || '').split(' ')[0],
  });
}

// POST /painel/ia/mensagem — recebe { mensagem, historico } e devolve { resposta }.
async function mensagem(req, res) {
  if (!ia.iaHabilitada()) {
    return res.status(503).json({ erro: 'O assistente ainda não está configurado.' });
  }

  const texto = String(req.body.mensagem || '').trim().slice(0, MAX_MSG);
  if (!texto) return res.status(400).json({ erro: 'Escreva uma pergunta.' });

  // Histórico vem do cliente (stateless): validamos o formato, limitamos a
  // quantidade e o tamanho. Só 'user'/'assistant' entram.
  const histBruto = Array.isArray(req.body.historico) ? req.body.historico : [];
  const mensagens = histBruto
    .filter((m) => m && (m.papel === 'user' || m.papel === 'assistant') && typeof m.texto === 'string')
    .slice(-MAX_HIST)
    .map((m) => ({ role: m.papel, content: m.texto.slice(0, MAX_HIST_TXT) }));
  mensagens.push({ role: 'user', content: texto });

  try {
    const { texto: resposta } = await ia.responder(contextoDe(req), mensagens);
    res.json({ resposta });
  } catch (e) {
    console.error('[ia] falha ao responder:', e.message);
    res.status(500).json({ erro: 'Não consegui responder agora. Tente de novo em instantes.' });
  }
}

module.exports = { ver, mensagem };
