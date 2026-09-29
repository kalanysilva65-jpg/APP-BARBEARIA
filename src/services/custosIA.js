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
  return process.env.IA_MODELO_COPILOTO || process.env.IA_MODELO || 'claude-haiku-4-5';
}
function custoUSD(tokensEntrada, tokensSaida, modelo) {
  const p = precoDe(modelo);
  // tokensEntrada já vem PONDERADO pelo cache (ver secretaria.js/ia.js): leitura
  // de cache foi guardada a 10% e escrita a 125%. Então aqui é só multiplicar
  // pelo preço de entrada — o resultado já reflete a fatura real.
  return (tokensEntrada / 1e6) * p.entrada + (tokensSaida / 1e6) * p.saida;
}
// Câmbio p/ exibir em R$. Configurável (COTACAO_DOLAR); padrão conservador.
const COTACAO_BRL = Number(process.env.COTACAO_DOLAR) || 5.5;
// Preço de referência do plano (por barbearia/mês) p/ estimar a MARGEM no painel.
// Configurável (PLANO_PRECO_REF); é só um parâmetro de exibição, não cobra nada.
const PLANO_PRECO_REF = Number(process.env.PLANO_PRECO_REF) || 199;
// Cobrança da Meta por mensagem (a partir de 01/10/2026). As mensagens de SERVIÇO
// (respostas da IA/equipe na janela de 24h) têm 1.000 grátis por NÚMERO por mês;
// daí em diante ~R$0,035 cada. Lembretes são template (utilidade): pagos desde a 1ª.
// Como a cobrança é centralizada no cartão da Cortavo, isso entra na MARGEM.
const WPP_GRATIS_MES = Number(process.env.WHATSAPP_GRATIS_MES) || 1000;
const WPP_PRECO_MSG_BRL = Number(process.env.WHATSAPP_PRECO_MSG_BRL) || 0.035;
const WPP_ALERTA_MSGS = Math.round(WPP_GRATIS_MES * 0.8); // avisa ao chegar em 80% da franquia
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

  const [barbearias, usos, usosModelo] = await Promise.all([
    prisma.barbearia.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.usoIA.findMany({ where: { competencia } }),
    prisma.usoIAModelo.findMany({ where: { competencia } }),
  ]);
  const usoPor = new Map(usos.map((u) => [u.barbeariaId, u]));
  // Uso por modelo agrupado por barbearia (para custo exato por preço de modelo).
  const modeloPor = new Map();
  for (const r of usosModelo) {
    if (!modeloPor.has(r.barbeariaId)) modeloPor.set(r.barbeariaId, []);
    modeloPor.get(r.barbeariaId).push(r);
  }

  const linhas = [];
  const totais = {
    custoUSD: 0, custoBRL: 0, margemBRL: 0, conversas: 0, respostas: 0, copiloto: 0, ativas: 0,
    tokensEntrada: 0, tokensSaida: 0, wppTokensEntrada: 0, wppTokensSaida: 0, copTokensEntrada: 0, copTokensSaida: 0,
    tokensEntradaCru: 0, msgsEnviadas: 0, msgsPagas: 0, lembretesMes: 0, custoMetaBRL: 0,
  };
  for (const b of barbearias) {
    const u = usoPor.get(b.id) || {};
    const conversas = await prisma.conversa.count({
      where: { barbeariaId: b.id, ultimaMensagemEm: { gte: ini, lt: fimExcl } },
    });
    // Tokens medidos (já PONDERADOS pelo cache: leitura 10%, escrita 125%).
    // Se HÁ detalhe por modelo (UsoIAModelo), o custo soma cada linha pelo preço
    // do SEU modelo (exato mesmo trocando de modelo no mês). Senão, cai no
    // agregado antigo, precificado pelo modelo atual (meses anteriores à tabela).
    const rowsModelo = modeloPor.get(b.id) || [];
    let wppEnt = 0, wppSai = 0, copEnt = 0, copSai = 0, custoWpp = 0, custoCop = 0, wppEntCru = 0, copEntCru = 0;
    if (rowsModelo.length) {
      for (const r of rowsModelo) {
        const c = custoUSD(r.tokensEntrada || 0, r.tokensSaida || 0, r.modelo);
        if (r.canal === 'copiloto') { copEnt += r.tokensEntrada || 0; copSai += r.tokensSaida || 0; copEntCru += r.tokensEntradaCru || 0; custoCop += c; }
        else { wppEnt += r.tokensEntrada || 0; wppSai += r.tokensSaida || 0; wppEntCru += r.tokensEntradaCru || 0; custoWpp += c; }
      }
    } else {
      wppEnt = u.tokensEntrada || 0;
      wppSai = u.tokensSaida || 0;
      copEnt = u.copilotoTokensEntrada || 0;
      copSai = u.copilotoTokensSaida || 0;
      wppEntCru = u.tokensEntradaCru || 0;
      copEntCru = u.copilotoTokensEntradaCru || 0;
      custoWpp = custoUSD(wppEnt, wppSai, mw);
      custoCop = custoUSD(copEnt, copSai, mc);
    }
    // Mensagens ENVIADAS no WhatsApp (IA + equipe): toda saída passa por emitir(),
    // que grava em Mensagem — então o histórico já serve de contador, sem tabela nova.
    const [msgsEnviadas, lembretesMes] = await Promise.all([
      prisma.mensagem.count({
        where: { autor: { in: ['ia', 'humano'] }, criadoEm: { gte: ini, lt: fimExcl }, conversa: { barbeariaId: b.id } },
      }),
      prisma.lembreteLog.count({ where: { barbeariaId: b.id, enviadoEm: { gte: ini, lt: fimExcl } } }),
    ]);
    const msgsPagas = Math.max(0, msgsEnviadas - WPP_GRATIS_MES);
    const custoMetaBRL = (msgsPagas + lembretesMes) * WPP_PRECO_MSG_BRL;
    const custo = custoWpp + custoCop;
    const custoBRL = custo * COTACAO_BRL + custoMetaBRL;
    // "Ativa" = teve algum uso no mês. Só essas contam na margem/receita estimada.
    const ativa = conversas > 0 || (u.respostas || 0) > 0 || (u.copilotoConsultas || 0) > 0 || msgsEnviadas > 0;
    const margemBRL = ativa ? PLANO_PRECO_REF - custoBRL : 0;
    linhas.push({
      id: b.id,
      nome: b.nome,
      conversas,
      respostas: u.respostas || 0,
      copilotoConsultas: u.copilotoConsultas || 0,
      custoWpp,
      custoCop,
      custoUSD: custo,
      custoBRL,
      // Custo médio por CONVERSA de WhatsApp no mês (só a parte da secretária).
      custoPorConversaBRL: conversas > 0 ? (custoWpp * COTACAO_BRL) / conversas : 0,
      ativa,
      margemBRL,
      margemPct: ativa && PLANO_PRECO_REF > 0 ? Math.round((margemBRL / PLANO_PRECO_REF) * 100) : null,
      // Tokens (para o detalhamento no painel).
      tokensEntrada: wppEnt + copEnt,
      tokensSaida: wppSai + copSai,
      tokensEntradaCru: wppEntCru + copEntCru,
      // WhatsApp (cobrança da Meta).
      msgsEnviadas,
      msgsPagas,
      lembretesMes,
      custoMetaBRL,
      alertaMsgs: msgsEnviadas >= WPP_ALERTA_MSGS,
      wppTokensEntrada: wppEnt,
      wppTokensSaida: wppSai,
      copTokensEntrada: copEnt,
      copTokensSaida: copSai,
    });
    totais.custoUSD += custo;
    totais.custoBRL += custoBRL;
    totais.conversas += conversas;
    totais.respostas += u.respostas || 0;
    totais.copiloto += u.copilotoConsultas || 0;
    totais.tokensEntrada += wppEnt + copEnt;
    totais.tokensSaida += wppSai + copSai;
    totais.tokensEntradaCru += wppEntCru + copEntCru;
    totais.msgsEnviadas += msgsEnviadas;
    totais.msgsPagas += msgsPagas;
    totais.lembretesMes += lembretesMes;
    totais.custoMetaBRL += custoMetaBRL;
    totais.wppTokensEntrada += wppEnt;
    totais.wppTokensSaida += wppSai;
    totais.copTokensEntrada += copEnt;
    totais.copTokensSaida += copSai;
    if (ativa) { totais.ativas += 1; totais.margemBRL += margemBRL; }
  }
  totais.custoPorConversaBRL = totais.conversas > 0 ? (totais.custoBRL / totais.conversas) : 0;
  linhas.sort((a, b) => b.custoUSD - a.custoUSD);
  return { competencia, cotacao: COTACAO_BRL, wppGratisMes: WPP_GRATIS_MES, wppPrecoMsgBRL: WPP_PRECO_MSG_BRL, precoPlanoRef: PLANO_PRECO_REF, modelos: { whatsapp: mw, copiloto: mc }, linhas, totais };
}

module.exports = { resumo, competenciaAtual };
