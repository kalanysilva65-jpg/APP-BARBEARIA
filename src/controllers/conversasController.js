// Caixa de entrada (Fase 3.2): lista de conversas + conversa aberta, resposta
// humana e o botão "assumir/devolver IA". Rota única /painel/conversas com ?id=
// para abrir uma conversa (o detalhe não vira path novo — mantém o design suave).
const atendimento = require('../services/atendimento');
const secretaria = require('../services/secretaria');
const { formatarTelefone } = require('../utils/telefone');

function primeiroNome(nome) {
  return (nome || '').trim().split(/\s+/)[0] || '';
}
function horaCurta(d) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// GET /painel/conversas  (?id=N abre uma conversa)
async function ver(req, res) {
  const conversas = await atendimento.listarConversas(req.barbeariaId);
  let aberta = null;
  if (req.query.id) {
    aberta = await atendimento.abrirConversa(req.barbeariaId, req.query.id);
  }
  res.render('painel/conversas', {
    titulo: 'Conversas',
    iaAtiva: secretaria.habilitada(),
    conversas: conversas.map((c) => ({
      id: c.id,
      nome: c.clienteNome || formatarTelefone(c.clienteTelefone),
      telefone: formatarTelefone(c.clienteTelefone),
      previa: c.ultimaPrevia || '',
      hora: horaCurta(c.ultimaMensagemEm),
      naoLidas: c.naoLidas,
      iaAtiva: c.iaAtiva,
      ativa: aberta && aberta.conversa.id === c.id,
    })),
    aberta: aberta
      ? {
          conversa: {
            id: aberta.conversa.id,
            nome: aberta.conversa.clienteNome || formatarTelefone(aberta.conversa.clienteTelefone),
            telefone: formatarTelefone(aberta.conversa.clienteTelefone),
            iaAtiva: aberta.conversa.iaAtiva,
          },
          mensagens: aberta.mensagens.map((m) => ({ autor: m.autor, texto: m.texto, hora: horaCurta(m.criadoEm) })),
        }
      : null,
  });
}

// POST /painel/conversas/:id/responder
async function responder(req, res) {
  const texto = String(req.body.texto || '').trim().slice(0, 2000);
  if (texto) await atendimento.responderComoHumano(req.barbeariaId, req.params.id, texto);
  res.redirect('/painel/conversas?id=' + encodeURIComponent(req.params.id));
}

// POST /painel/conversas/:id/ia   (body ativa=0|1) — assumir/devolver
async function definirIA(req, res) {
  const ativa = String(req.body.ativa) === '1';
  await atendimento.definirIA(req.barbeariaId, req.params.id, ativa);
  res.redirect('/painel/conversas?id=' + encodeURIComponent(req.params.id));
}

// POST /painel/conversas/simular — injeta uma mensagem de cliente (SÓ TESTE, admin),
// simulando o que o webhook do WhatsApp fará na 3.3.
async function simular(req, res) {
  const telefone = String(req.body.telefone || '').trim();
  const nome = String(req.body.nome || '').trim();
  const texto = String(req.body.texto || '').trim().slice(0, 2000);
  if (telefone && texto) {
    const r = await atendimento.receberMensagemCliente(req.barbeariaId, { telefone, nome, texto });
    if (r && r.conversaId) return res.redirect('/painel/conversas?id=' + r.conversaId);
  }
  res.redirect('/painel/conversas');
}

module.exports = { ver, responder, definirIA, simular };
