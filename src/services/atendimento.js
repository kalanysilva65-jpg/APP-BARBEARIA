// Atendimento / caixa de entrada (Fase 3.2) + LGPD e tetos de custo (Fase 3.5).
// Orquestra: mensagem do cliente entra -> grava -> (se cabível) a secretária
// responde. Em 3.3 o webhook do WhatsApp chama `receberMensagemCliente` e o envio
// real sai por `enviarWhatsApp` (hoje stub).
//
// Camadas de proteção (3.5), na ordem em que agem antes de gastar IA:
//   1) OPT-OUT: "SAIR"/"PARAR" pausa a IA na conversa e chama um humano.
//   2) KILL SWITCH global (env SECRETARIA_DESLIGADA=1).
//   3) FREIO ANTI-ABUSO: flood de um mesmo número não roda a IA à toa.
//   4) TETO mensal por barbearia: ao estourar, a IA pausa no mês (humanos seguem).
// Tudo escopado por barbeariaId (multi-tenant).
const prisma = require('../config/db');
const secretaria = require('./secretaria');
const faq = require('./faq');
const whatsapp = require('./whatsapp');
const notificacoes = require('./notificacoes');
const { normalizarTelefone } = require('../utils/telefone');

const HIST_MAX = 30; // mensagens recentes enviadas à IA como contexto
const TETO_PADRAO = 1500; // respostas de IA por mês por barbearia (config: secretaria_teto_mes)
const TETO_COPILOTO_PADRAO = 200; // consultas do copiloto/mês por barbearia (config: copiloto_teto_mes)
const ABUSO_MAX_HORA = 20; // msgs do MESMO cliente numa 1h antes de a IA recuar
const REPETICOES_RESET = 2; // 2ª repetição -> auto-recuperação (responde sem o histórico enviesado)
const REPETICOES_MAX = 3; // 3ª repetição -> passa pra humano (IA travou de vez)
const RETENCAO_MESES = 12; // conversas mais antigas que isso são apagadas (LGPD)
const PALAVRAS_OPTOUT = ['SAIR', 'PARAR', 'STOP', 'CANCELAR'];

// Remove "metades soltas" de emoji (surrogates sem par). Elas surgem quando um
// texto com emoji é cortado no meio (ex.: slice de 80 na prévia) e QUEBRAM a
// serialização do Prisma/SQLite -> "unexpected end of hex escape". Tira o high
// surrogate sem o low seguinte, e o low sem o high anterior.
function semSurrogatesSoltos(s) {
  return String(s == null ? '' : s)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
function previa(texto) {
  return semSurrogatesSoltos((texto || '').replace(/\s+/g, ' ').trim().slice(0, 80));
}
function competenciaAtual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
// Opt-out só quando a mensagem INTEIRA é a palavra-chave (evita falso positivo
// tipo "quero sair do plano").
function ehOptOut(texto) {
  const limpo = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  return PALAVRAS_OPTOUT.includes(limpo);
}

// Pedido explícito de atendimento HUMANO (além do opt-out). Determinístico: não
// depende de a IA decidir chamar a ferramenta — garante o handoff mesmo que o
// modelo hesite ou tente responder. Exige um verbo de "querer/falar" JUNTO de um
// alvo humano, pra não confundir com "você é humano?" (isso é tratado no prompt).
function pedeHumano(texto) {
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const querFalar = /(falar|conversar|atendimento|atender|passar|transferir|me passa|quero|queria|preciso|tem |chama|chamar)/.test(t);
  const alvoHumano = /(atendente|humano|uma pessoa|com alguem|responsavel|gerente|com o dono|ser humano|pessoa de verdade|nao (e|eh) (robo|bot|ia))/.test(t);
  return querFalar && alvoHumano;
}

// "Assinatura" de uma mensagem para comparar repetição (ignora acento, caixa,
// pontuação e espaços). "Quero agendar!" e "quero agendar" viram a mesma coisa.
function assinaturaMsg(texto) {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
// Quantas das ÚLTIMAS mensagens do cliente (incluindo a atual) são praticamente
// iguais, em sequência. Se o cliente repete o mesmo pedido, a IA não resolveu.
function repeticoesSeguidas(msgs) {
  const doCliente = msgs.filter((m) => m.autor === 'cliente');
  if (!doCliente.length) return 0;
  const alvo = assinaturaMsg(doCliente[doCliente.length - 1].texto);
  if (!alvo) return 0;
  let n = 0;
  for (let i = doCliente.length - 1; i >= 0; i--) {
    if (assinaturaMsg(doCliente[i].texto) === alvo) n++;
    else break;
  }
  return n;
}

async function lerConfig(barbeariaId, chave, padrao) {
  const c = await prisma.configuracao
    .findUnique({ where: { barbeariaId_chave: { barbeariaId, chave } } })
    .catch(() => null);
  return c ? c.valor : padrao;
}
async function modoDaBarbearia(barbeariaId) {
  const v = await lerConfig(barbeariaId, 'secretaria_modo', 'cortavo');
  return v === 'terceiros' ? 'terceiros' : 'cortavo';
}

function historicoParaIA(mensagens) {
  const arr = [];
  for (const m of mensagens) {
    const role = m.autor === 'cliente' ? 'user' : 'assistant';
    if (arr.length && arr[arr.length - 1].role === role) {
      arr[arr.length - 1].content += '\n' + m.texto;
    } else {
      arr.push({ role, content: m.texto });
    }
  }
  while (arr.length && arr[0].role !== 'user') arr.shift();
  return arr;
}

// Envio real pela WhatsApp Cloud API (Fase 3.3). Usa as credenciais da barbearia
// da conversa e manda para o telefone do cliente. Erros são engolidos lá dentro
// (logados) — a mensagem já ficou gravada na conversa de qualquer jeito.
async function enviarWhatsApp(conversa, texto) {
  return whatsapp.enviarTexto(conversa.barbeariaId, conversa.clienteTelefone, texto);
}

// Grava uma mensagem de saída (IA ou sistema), atualiza a prévia e envia.
async function emitir(conversa, autor, texto) {
  const limpo = semSurrogatesSoltos(texto);
  await prisma.mensagem.create({ data: { conversaId: conversa.id, autor, texto: limpo } });
  await prisma.conversa.update({ where: { id: conversa.id }, data: { ultimaPrevia: previa(limpo), ultimaMensagemEm: new Date() } });
  await enviarWhatsApp(conversa, limpo);
}

// --- Teto de custo (uso mensal de IA por barbearia) ---
async function estadoTeto(barbeariaId) {
  const competencia = competenciaAtual();
  const teto = parseInt(await lerConfig(barbeariaId, 'secretaria_teto_mes', ''), 10) || TETO_PADRAO;
  const uso = await prisma.usoIA.findUnique({ where: { barbeariaId_competencia: { barbeariaId, competencia } } });
  const respostas = uso ? uso.respostas : 0;
  return { competencia, teto, respostas, atingido: respostas >= teto, avisado: uso ? uso.avisadoTeto : false };
}
// Teto mensal do COPILOTO (Assistente do painel), à parte do WhatsApp.
async function estadoTetoCopiloto(barbeariaId) {
  const competencia = competenciaAtual();
  const teto = parseInt(await lerConfig(barbeariaId, 'copiloto_teto_mes', ''), 10) || TETO_COPILOTO_PADRAO;
  const uso = await prisma.usoIA.findUnique({ where: { barbeariaId_competencia: { barbeariaId, competencia } } });
  const consultas = uso ? uso.copilotoConsultas : 0;
  return { competencia, teto, consultas, atingido: consultas >= teto };
}

async function registrarUso(barbeariaId, competencia, usage) {
  await prisma.usoIA.upsert({
    where: { barbeariaId_competencia: { barbeariaId, competencia } },
    create: { barbeariaId, competencia, respostas: 1, tokensEntrada: usage?.input || 0, tokensSaida: usage?.output || 0 },
    update: { respostas: { increment: 1 }, tokensEntrada: { increment: usage?.input || 0 }, tokensSaida: { increment: usage?.output || 0 } },
  });
}
// Uso do COPILOTO (Assistente do painel) — contado à parte do WhatsApp.
async function registrarUsoCopiloto(barbeariaId, usage) {
  const competencia = competenciaAtual();
  await prisma.usoIA.upsert({
    where: { barbeariaId_competencia: { barbeariaId, competencia } },
    create: {
      barbeariaId,
      competencia,
      copilotoConsultas: 1,
      copilotoTokensEntrada: usage?.input || 0,
      copilotoTokensSaida: usage?.output || 0,
    },
    update: {
      copilotoConsultas: { increment: 1 },
      copilotoTokensEntrada: { increment: usage?.input || 0 },
      copilotoTokensSaida: { increment: usage?.output || 0 },
    },
  });
}

async function marcarAvisadoTeto(barbeariaId, competencia) {
  await prisma.usoIA.upsert({
    where: { barbeariaId_competencia: { barbeariaId, competencia } },
    create: { barbeariaId, competencia, respostas: 0, avisadoTeto: true },
    update: { avisadoTeto: true },
  });
}

// Freio anti-abuso: quantas mensagens do cliente nesta conversa na última 1h.
async function floodNaConversa(conversaId) {
  const umaHora = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.mensagem.count({ where: { conversaId, autor: 'cliente', criadoEm: { gte: umaHora } } });
}

// Mensagem RECEBIDA de um cliente. Ponto único chamado pelo webhook (3.3).
async function receberMensagemCliente(barbeariaId, { telefone, nome, texto }) {
  const tel = normalizarTelefone(telefone) || String(telefone || '').trim();
  if (!tel || !texto) return { erro: 'Dados insuficientes.' };
  // Blinda contra emoji cortado/malformado vindo do cliente (mesmo motivo da
  // previa): evita quebrar o Prisma ao gravar/atualizar a conversa.
  texto = semSurrogatesSoltos(texto);

  // Cria/atualiza a conversa e grava a mensagem do cliente.
  let conversa = await prisma.conversa.findUnique({
    where: { barbeariaId_clienteTelefone: { barbeariaId, clienteTelefone: tel } },
  });
  const nova = !conversa;
  if (!conversa) {
    conversa = await prisma.conversa.create({ data: { barbeariaId, clienteTelefone: tel, clienteNome: nome || null } });
  } else if (nome && !conversa.clienteNome) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { clienteNome: nome } });
  }
  await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: 'cliente', texto } });
  await prisma.conversa.update({
    where: { id: conversa.id },
    data: { ultimaPrevia: previa(texto), ultimaMensagemEm: new Date(), naoLidas: { increment: 1 }, status: 'aberta' },
  });

  // (1) OPT-OUT: pausa a IA nesta conversa e chama um humano.
  if (ehOptOut(texto)) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: false } });
    await emitir(conversa, 'ia', 'Tudo bem! 🙂 Vou avisar a equipe para continuar seu atendimento por aqui.');
    await notificacoes.notificarHumanoSolicitado(barbeariaId, conversa);
    return { conversaId: conversa.id, optOut: true };
  }

  // (1b) HANDOFF: cliente pede uma PESSOA. Pausa a IA nesta conversa, avisa a
  // equipe (push no app e fora dele) e responde curto. Só quando a IA ainda está
  // ativa na conversa (evita re-notificar depois de já ter passado pra humano).
  if (conversa.iaAtiva && pedeHumano(texto)) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: false } });
    await emitir(conversa, 'ia', 'Claro! 🙂 Já estou chamando a equipe pra continuar seu atendimento por aqui. Um instante, por favor.');
    await notificacoes.notificarHumanoSolicitado(barbeariaId, conversa);
    return { conversaId: conversa.id, handoffHumano: true };
  }

  // Portões que impedem a IA de responder automaticamente. `secretaria_pausada`
  // é o liga/desliga por barbearia (botão "Pausar IA" no painel): a mensagem do
  // cliente continua sendo gravada e aparece na Caixa de entrada, mas a IA não
  // responde sozinha até o dono reativar.
  const pausada = (await lerConfig(barbeariaId, 'secretaria_pausada', null)) === '1';
  const ligada = secretaria.habilitada() && process.env.SECRETARIA_DESLIGADA !== '1' && !pausada;
  if (!conversa.iaAtiva || !ligada) return { conversaId: conversa.id, respostaIA: null };

  // Aviso de privacidade (LGPD) — só na PRIMEIRA mensagem da conversa.
  if (nova) {
    const b0 = await prisma.barbearia.findUnique({ where: { id: barbeariaId } });
    const link = await lerConfig(barbeariaId, 'secretaria_privacidade_link', null);
    let aviso = `Você fala com o atendimento virtual 🤖 da ${b0 ? b0.nome : 'nossa barbearia'}. Usamos seus dados apenas para te atender e agendar.`;
    if (link) aviso += ` Política de privacidade: ${link}`;
    aviso += ` (Se preferir um atendente, é só escrever SAIR.)`;
    await emitir(conversa, 'ia', aviso);
  }

  // (3) Freio anti-abuso: muitas mensagens do mesmo cliente em 1h. Em vez de ficar
  // muda (deixa o cliente no vácuo e a conversa no limbo), passa pra um humano e
  // para de gastar IA nesta conversa. iaAtiva=false evita re-notificar a cada msg.
  if ((await floodNaConversa(conversa.id)) > ABUSO_MAX_HORA) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: false } });
    await emitir(conversa, 'ia', 'Vou pedir pra alguém da equipe continuar seu atendimento por aqui, tá? 🙂');
    await notificacoes.notificarHumanoSolicitado(barbeariaId, conversa);
    return { conversaId: conversa.id, freado: true };
  }

  // (3.5) CACHE DE FAQ: pergunta estática (endereço, horário, preços) responde
  // direto dos dados — SEM IA (custo zero), e vale mesmo se o teto da IA estourou.
  const respostaFaq = await faq.tentarResponder(barbeariaId, texto);
  if (respostaFaq) {
    await emitir(conversa, 'ia', respostaFaq);
    return { conversaId: conversa.id, respostaIA: respostaFaq, faqHit: true };
  }

  // (4) Teto mensal por barbearia.
  const teto = await estadoTeto(barbeariaId);
  if (teto.atingido) {
    if (!teto.avisado) await marcarAvisadoTeto(barbeariaId, teto.competencia);
    return { conversaId: conversa.id, respostaIA: null, tetoAtingido: true };
  }

  // Monta contexto e responde.
  const msgs = await prisma.mensagem.findMany({ where: { conversaId: conversa.id }, orderBy: { criadoEm: 'asc' }, take: HIST_MAX });

  // (4.5) ANTI-LOOP em 2 níveis. Quando o cliente repete praticamente a MESMA
  // mensagem, a IA está presa no próprio padrão (o histórico "envenenado" faz ela
  // imitar as respostas anteriores). Em vez de exigir apagar a conversa na mão:
  //   - 3ª repetição -> SALVA-VIDAS: passa pra humano e para de gastar IA.
  //   - 2ª repetição -> AUTO-RECUPERAÇÃO: responde IGNORANDO o histórico velho (só
  //     a última mensagem), o mesmo efeito de "recomeçar", sem apagar nada.
  const repeticoes = repeticoesSeguidas(msgs);
  if (repeticoes >= REPETICOES_MAX) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: false } });
    await emitir(conversa, 'ia', 'Deixa eu chamar alguém da equipe pra te ajudar melhor com isso 🙂 Já já uma pessoa te responde por aqui.');
    await notificacoes.notificarHumanoSolicitado(barbeariaId, conversa);
    return { conversaId: conversa.id, loopDetectado: true };
  }
  const contextoLimpo = repeticoes >= REPETICOES_RESET;

  const b = await prisma.barbearia.findUnique({ where: { id: barbeariaId } });
  const ctx = {
    barbeariaId,
    conversaId: conversa.id, // permite à ferramenta encaminhar_humano pausar a IA desta conversa
    modo: await modoDaBarbearia(barbeariaId),
    nomeBarbearia: b ? b.nome : 'a barbearia',
    permitirAgendar: true,
    clienteTelefone: conversa.clienteTelefone,
    clienteNome: conversa.clienteNome || null,
    // Se um HUMANO já respondeu nesta conversa e mesmo assim a IA está rodando
    // agora, é porque a equipe DEVOLVEU o atendimento à IA. Sinaliza pra ela não
    // ficar repetindo o "vou chamar a equipe" com base no histórico antigo.
    retomadoDeHumano: msgs.some((m) => m.autor === 'humano'),
    regrasExtras: await lerConfig(barbeariaId, 'secretaria_regras', null),
    config: { linkAgendamento: (await lerConfig(barbeariaId, 'secretaria_link', null)) || (b && b.slug ? `https://agenda.exemplo.com/${b.slug}` : null) },
  };

  // Auto-recuperação: na 2ª repetição, manda só a última mensagem do cliente (sem
  // o histórico que estava enviesando o modelo). Recomeço limpo, sem apagar nada.
  const historico = contextoLimpo
    ? historicoParaIA(msgs.filter((m) => m.autor === 'cliente').slice(-1))
    : historicoParaIA(msgs);

  let respostaIA = null;
  try {
    const { texto: resp, usage } = await secretaria.responder(ctx, historico);
    respostaIA = resp;
    await emitir(conversa, 'ia', resp);
    await registrarUso(barbeariaId, teto.competencia, usage);
  } catch (e) {
    // Log detalhado: e.message às vezes vem vazio (ex.: erro da API Anthropic traz
    // o detalhe em .status/.error). Sem isso não dá pra saber por que a IA caiu.
    console.error('[atendimento] IA falhou:', e && (e.message || e.name || String(e)));
    if (e && e.status) console.error('[atendimento] IA status:', e.status);
    if (e && e.error) { try { console.error('[atendimento] IA erro:', JSON.stringify(e.error)); } catch (_) {} }
    if (e && e.stack) console.error('[atendimento] IA stack:', e.stack);
    // Nunca deixar o cliente sem resposta: manda um recado curto (fica gravado na
    // conversa mesmo se o envio falhar) para ele não achar que ninguém viu.
    try {
      await emitir(conversa, 'ia', 'Tive uma instabilidade rapidinha por aqui 😅 Pode mandar de novo, por favor? Se preferir, escreva SAIR para falar com um atendente.');
    } catch (_) { /* envio pode falhar; a mensagem já foi tentada */ }
  }
  return { conversaId: conversa.id, respostaIA };
}

// Lista de conversas da barbearia (mais recentes primeiro).
async function listarConversas(barbeariaId) {
  return prisma.conversa.findMany({
    where: { barbeariaId, status: 'aberta' },
    orderBy: { ultimaMensagemEm: 'desc' },
    take: 50,
  });
}

async function abrirConversa(barbeariaId, conversaId) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa) return null;
  if (conversa.naoLidas > 0) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { naoLidas: 0 } });
    conversa.naoLidas = 0;
  }
  const mensagens = await prisma.mensagem.findMany({ where: { conversaId: conversa.id }, orderBy: { criadoEm: 'asc' } });
  return { conversa, mensagens };
}

async function responderComoHumano(barbeariaId, conversaId, texto) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa || !texto) return null;
  await emitir(conversa, 'humano', texto);
  return conversa;
}

async function definirIA(barbeariaId, conversaId, ativa) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa) return null;
  return prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: !!ativa } });
}

// Mensagens de uma conversa com id MAIOR que `aposId` (para o polling do chat).
// Zera as não-lidas se chegou algo novo (a equipe está com a conversa aberta).
async function mensagensApos(barbeariaId, conversaId, aposId) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa) return null;
  const msgs = await prisma.mensagem.findMany({
    where: { conversaId: conversa.id, id: { gt: Number(aposId) || 0 } },
    orderBy: { criadoEm: 'asc' },
  });
  if (msgs.length && conversa.naoLidas > 0) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { naoLidas: 0 } });
  }
  return { conversa, msgs };
}

// LGPD: exclui uma conversa e todas as suas mensagens (direito de exclusão).
// Escopado por barbearia — nunca apaga de outro tenant.
async function excluirConversa(barbeariaId, conversaId) {
  const r = await prisma.conversa.deleteMany({ where: { id: Number(conversaId), barbeariaId } });
  return r.count > 0;
}

// LGPD: retenção. Apaga conversas sem atividade há mais de RETENCAO_MESES.
// Roda por um cron (scripts/retencao-conversas.js). Retorna quantas apagou.
async function expirarConversasAntigas() {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - RETENCAO_MESES);
  const r = await prisma.conversa.deleteMany({ where: { ultimaMensagemEm: { lt: limite } } });
  return r.count;
}

module.exports = {
  receberMensagemCliente,
  listarConversas,
  abrirConversa,
  mensagensApos,
  responderComoHumano,
  definirIA,
  excluirConversa,
  expirarConversasAntigas,
  estadoTeto,
  estadoTetoCopiloto,
  registrarUsoCopiloto,
};
