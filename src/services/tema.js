// Tema visual de cada barbearia (pedido do dono, 2026-07-31).
//
// São DOIS temas de verdade, não duas peles do mesmo desenho — a estrutura das
// telas difere (o "suave" tem grade de atalhos, cartão flutuante e sino de
// notificação que o "turno6" não tem), então cada um traz suas próprias views.
//
//   turno6 — editorial: canto vivo, sem sombra, hierarquia por tipografia
//   suave  — app moderno: cartão arredondado, sombra, avatar, pílula
//
// A escolha é POR APP: o dono pode querer o painel num idioma e a página
// pública de agendamento em outro, então são duas chaves separadas.
const prisma = require('../config/db');

const TEMAS = ['turno6', 'suave'];
const PADRAO = 'turno6'; // o que já estava no ar antes de existir a escolha

const CHAVES = {
  painel: 'tema_painel',
  publico: 'tema_publico',
};

function normalizar(valor) {
  return TEMAS.indexOf(valor) !== -1 ? valor : PADRAO;
}

// Lê o tema de um app ('painel' | 'publico') de uma barbearia.
async function temaDe(barbeariaId, app) {
  const chave = CHAVES[app];
  if (!barbeariaId || !chave) return PADRAO;
  const c = await prisma.configuracao.findUnique({
    where: { barbeariaId_chave: { barbeariaId, chave } },
  });
  return normalizar(c && c.valor);
}

// Lê os dois de uma vez (uma consulta só) — é o que o middleware precisa.
async function temasDe(barbeariaId) {
  if (!barbeariaId) return { painel: PADRAO, publico: PADRAO };
  const registros = await prisma.configuracao.findMany({
    where: { barbeariaId, chave: { in: [CHAVES.painel, CHAVES.publico] } },
  });
  const achar = (chave) => {
    const r = registros.find((x) => x.chave === chave);
    return normalizar(r && r.valor);
  };
  return { painel: achar(CHAVES.painel), publico: achar(CHAVES.publico) };
}

// Grava o tema de um app. Valor inválido cai no padrão em vez de gravar lixo.
async function definirTema(barbeariaId, app, tema) {
  const chave = CHAVES[app];
  if (!barbeariaId || !chave) return;
  const valor = normalizar(tema);
  await prisma.configuracao.upsert({
    where: { barbeariaId_chave: { barbeariaId, chave } },
    update: { valor },
    create: { barbeariaId, chave, valor },
  });
}

module.exports = { TEMAS, PADRAO, temaDe, temasDe, definirTema };
