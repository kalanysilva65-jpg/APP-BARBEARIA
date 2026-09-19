// Painel-mestre: canais de agendamento e mensagens enviadas, por mês, em TODAS
// as barbearias. Espelha o formato do `custosIA.js` (resumo(competencia)).
//
// - CANAIS: de onde vieram os agendamentos CRIADOS no mês (Agendamento.origem):
//   publico (link) | app (marketplace) | whatsapp (secretária IA) | barbeiro
//   (manual). Registros antigos, sem origem, entram como "anterior".
// - MENSAGENS: LEMBRETES (Agendamento.lembreteEnviadoEm no mês) e IA (Mensagem
//   autor='ia' no mês) — quantas, quando e pra quem.
const prisma = require('../config/db');

// Ordem/rótulos fixos dos canais (o "anterior" fica por último, é resíduo).
const CANAIS = [
  { chave: 'publico', label: 'Link público' },
  { chave: 'app', label: 'App do cliente' },
  { chave: 'whatsapp', label: 'WhatsApp (IA)' },
  { chave: 'barbeiro', label: 'Barbeiro (manual)' },
  { chave: 'anterior', label: 'Anterior' },
];
// Teto das listas de detalhe (quais clientes / pra quem) — a página é leitura,
// não um dump do banco. Acima disso mostra "+N".
const MAX_LISTA = 120;

function competenciaAtual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function fmtQuando(d) {
  const x = new Date(d);
  return (
    String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') +
    ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0')
  );
}
function canalDe(origem) {
  return CANAIS.some((c) => c.chave === origem) ? origem : 'anterior';
}
function zerarCanais() {
  const o = {};
  for (const c of CANAIS) o[c.chave] = 0;
  return o;
}

async function resumo(competencia) {
  competencia = /^\d{4}-\d{2}$/.test(competencia || '') ? competencia : competenciaAtual();
  const [ano, mes] = competencia.split('-').map(Number);
  const ini = new Date(ano, mes - 1, 1);
  const fimExcl = new Date(ano, mes, 1);

  const [barbearias, ags, lembretes, iaMsgs] = await Promise.all([
    prisma.barbearia.findMany({ select: { id: true, nome: true } }),
    // Agendamentos CRIADOS no mês (a origem é sobre o momento da marcação).
    prisma.agendamento.findMany({
      where: { criadoEm: { gte: ini, lt: fimExcl } },
      select: { barbeariaId: true, origem: true, clienteNome: true, criadoEm: true, data: true, horaInicio: true },
      orderBy: { criadoEm: 'desc' },
    }),
    // Lembretes DISPARADOS no mês — da tabela de log durável (sobrevive à
    // exclusão do agendamento), não da marca no próprio agendamento.
    prisma.lembreteLog.findMany({
      where: { enviadoEm: { gte: ini, lt: fimExcl } },
      select: { barbeariaId: true, clienteNome: true, clienteTelefone: true, enviadoEm: true, horaAgendamento: true },
      orderBy: { enviadoEm: 'desc' },
    }),
    // Mensagens que a IA ENVIOU no mês (autor = 'ia').
    prisma.mensagem.findMany({
      where: { autor: 'ia', criadoEm: { gte: ini, lt: fimExcl } },
      select: { criadoEm: true, conversa: { select: { barbeariaId: true, clienteNome: true, clienteTelefone: true } } },
      orderBy: { criadoEm: 'desc' },
    }),
  ]);
  const nomeBarbearia = new Map(barbearias.map((b) => [b.id, b.nome]));

  // --- Canais ---------------------------------------------------------------
  const totaisCanais = zerarCanais();
  const porBarbeariaCanais = new Map(); // barbeariaId -> { nome, publico, app, ... , total }
  const clientesCanais = [];
  for (const ag of ags) {
    const canal = canalDe(ag.origem);
    totaisCanais[canal] += 1;
    if (!porBarbeariaCanais.has(ag.barbeariaId)) {
      porBarbeariaCanais.set(ag.barbeariaId, { nome: nomeBarbearia.get(ag.barbeariaId) || ('#' + ag.barbeariaId), ...zerarCanais(), total: 0 });
    }
    const linha = porBarbeariaCanais.get(ag.barbeariaId);
    linha[canal] += 1;
    linha.total += 1;
    if (clientesCanais.length < MAX_LISTA) {
      clientesCanais.push({
        cliente: ag.clienteNome || '—',
        barbearia: nomeBarbearia.get(ag.barbeariaId) || ('#' + ag.barbeariaId),
        canal,
        canalLabel: (CANAIS.find((c) => c.chave === canal) || {}).label || canal,
        quando: fmtQuando(ag.criadoEm),
        para: fmtQuando(new Date(ag.data.getFullYear(), ag.data.getMonth(), ag.data.getDate())).slice(0, 5) + ' ' + ag.horaInicio,
      });
    }
  }
  const totalCanais = CANAIS.reduce((s, c) => s + totaisCanais[c.chave], 0);
  const canaisResumo = CANAIS.map((c) => ({
    chave: c.chave,
    label: c.label,
    qtd: totaisCanais[c.chave],
    pct: totalCanais > 0 ? Math.round((totaisCanais[c.chave] / totalCanais) * 100) : 0,
  }));
  const linhasCanais = Array.from(porBarbeariaCanais.values()).sort((a, b) => b.total - a.total);

  // --- Mensagens: lembretes -------------------------------------------------
  const lembretePorBarbearia = new Map();
  const lembreteLista = [];
  for (const lg of lembretes) {
    lembretePorBarbearia.set(lg.barbeariaId, (lembretePorBarbearia.get(lg.barbeariaId) || 0) + 1);
    if (lembreteLista.length < MAX_LISTA) {
      lembreteLista.push({
        cliente: lg.clienteNome || '—',
        telefone: lg.clienteTelefone || '',
        barbearia: nomeBarbearia.get(lg.barbeariaId) || ('#' + lg.barbeariaId),
        quando: fmtQuando(lg.enviadoEm),
        para: lg.horaAgendamento || '',
      });
    }
  }

  // --- Mensagens: IA --------------------------------------------------------
  const iaPorBarbearia = new Map();
  const iaLista = [];
  for (const m of iaMsgs) {
    const bId = m.conversa ? m.conversa.barbeariaId : null;
    if (bId == null) continue;
    iaPorBarbearia.set(bId, (iaPorBarbearia.get(bId) || 0) + 1);
    if (iaLista.length < MAX_LISTA) {
      iaLista.push({
        cliente: (m.conversa && m.conversa.clienteNome) || (m.conversa && m.conversa.clienteTelefone) || '—',
        telefone: (m.conversa && m.conversa.clienteTelefone) || '',
        barbearia: nomeBarbearia.get(bId) || ('#' + bId),
        quando: fmtQuando(m.criadoEm),
      });
    }
  }

  function tabelaPorBarbearia(mapa) {
    return Array.from(mapa.entries())
      .map(([id, qtd]) => ({ barbearia: nomeBarbearia.get(id) || ('#' + id), qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }

  return {
    competencia,
    canais: {
      total: totalCanais,
      resumo: canaisResumo,
      porBarbearia: linhasCanais,
      clientes: clientesCanais,
      clientesTruncado: Math.max(0, ags.length - clientesCanais.length),
      colunas: CANAIS,
    },
    lembretes: {
      total: lembretes.length,
      porBarbearia: tabelaPorBarbearia(lembretePorBarbearia),
      lista: lembreteLista,
      truncado: Math.max(0, lembretes.length - lembreteLista.length),
    },
    ia: {
      total: iaMsgs.length,
      porBarbearia: tabelaPorBarbearia(iaPorBarbearia),
      lista: iaLista,
      truncado: Math.max(0, iaMsgs.length - iaLista.length),
    },
  };
}

module.exports = { resumo, competenciaAtual };
