// Uso & custos de IA por barbearia (painel-mestre). Lê o que já medimos em
// `UsoIA` (WhatsApp + copiloto) e conta as conversas do mês em `Conversa`, e
// estima o custo em US$ pelos preços dos modelos.
//
// É ESTIMATIVA: o uso é real (medido por nós), mas a fatura oficial vive no
// console da Anthropic (IA) e da Meta (WhatsApp). O custo do WhatsApp aqui é só
// a parte da IA — a cobrança por conversa da Meta é à parte.
const prisma = require('../config/db');

// Preços em US$ por 1 milhão de tokens (fonte: tabela de modelos da Anthropic).
const PRECOS = {
  'claude-haiku-4-5': { entrada: 1, saida: 5 },
  'claude-sonnet-5': { entrada: 2, saida: 10 },
  'claude-opus-5': { entrada: 5, saida: 25 },
  'claude-opus-4-8': { entrada: 5, saida: 25 },
};
function precoDe(modelo) {
  return PRECOS[modelo] || PRECOS['claude-haiku-4-5'];
}
function modeloWhatsapp() {
  return process.env.IA_MODELO_WHATSAPP || process.env.IA_MODELO || 'claude-haiku-4-5';
}
function modeloCopiloto() {
  return process.env.IA_MODELO_COPILOTO || process.env.IA_MODELO || 'claude-sonnet-5';
}
function custoUSD(tokensEntrada, tokensSaida, modelo) {
  const p = precoDe(modelo);
  return (tokensEntrada / 1e6) * p.entrada + (tokensSaida / 1e6) * p.saida;
}
function competenciaAtual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Resumo por barbearia para a competência (mês) dada.
async function resumo(competencia) {
  competencia = /^\d{4}-\d{2}$/.test(competencia || '') ? competencia : competenciaAtual();
  const [ano, mes] = competencia.split('-').map(Number);
  const ini = new Date(ano, mes - 1, 1);
  const fimExcl = new Date(ano, mes, 1);

  const mw = modeloWhatsapp();
  const mc = modeloCopiloto();

  const [barbearias, usos] = await Promise.all([
    prisma.barbearia.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.usoIA.findMany({ where: { competencia } }),
  ]);
  const usoPor = new Map(usos.map((u) => [u.barbeariaId, u]));

  const linhas = [];
  const totais = { custoUSD: 0, conversas: 0, respostas: 0, copiloto: 0 };
  for (const b of barbearias) {
    const u = usoPor.get(b.id) || {};
    const conversas = await prisma.conversa.count({
      where: { barbeariaId: b.id, ultimaMensagemEm: { gte: ini, lt: fimExcl } },
    });
    const custoWpp = custoUSD(u.tokensEntrada || 0, u.tokensSaida || 0, mw);
    const custoCop = custoUSD(u.copilotoTokensEntrada || 0, u.copilotoTokensSaida || 0, mc);
    const custo = custoWpp + custoCop;
    linhas.push({
      id: b.id,
      nome: b.nome,
      conversas,
      respostas: u.respostas || 0,
      copilotoConsultas: u.copilotoConsultas || 0,
      custoWpp,
      custoCop,
      custoUSD: custo,
    });
    totais.custoUSD += custo;
    totais.conversas += conversas;
    totais.respostas += u.respostas || 0;
    totais.copiloto += u.copilotoConsultas || 0;
  }
  linhas.sort((a, b) => b.custoUSD - a.custoUSD);
  return { competencia, modelos: { whatsapp: mw, copiloto: mc }, linhas, totais };
}

module.exports = { resumo, competenciaAtual };
