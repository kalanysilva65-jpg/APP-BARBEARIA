// Cache de FAQ (alavanca de margem): perguntas repetidas e ESTÁTICAS respondem
// direto dos dados da barbearia, SEM chamar a IA (custo zero). Só endereço,
// horário de FUNCIONAMENTO e tabela de PREÇOS — coisas que não mudam de contexto.
//
// Regra de ouro: ser CONSERVADOR. Só dispara quando a intenção é inequívoca; em
// qualquer dúvida (ou se envolver DATA/DISPONIBILIDADE), retorna null e a IA
// assume. Assim nunca devolve uma resposta pronta errada.
const prisma = require('../config/db');
const { DIAS_SEMANA } = require('../config/constantes');

function normalizar(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function fmtBRL(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Se a mensagem fala de DATA/AGENDA, NÃO é FAQ estático (ex.: "tem horário
// amanhã?", "que horas tem hoje?") — vai pra IA calcular disponibilidade.
const AGENDA = /(amanha|hoje|depois|semana|sabado|domingo|segunda|terca|quarta|quinta|sexta|livre|vaga|dispon|marca|agend|reserv|encaix)/;

// Retorna a resposta pronta (string) se a pergunta casar com um FAQ estático; senão null.
async function tentarResponder(barbeariaId, texto) {
  const t = normalizar(texto);
  if (t.length > 120) return null; // pergunta longa/composta → IA

  // ENDEREÇO / LOCALIZAÇÃO
  if (/(endereco|onde fica|onde voces|onde vcs|localizacao|como chego|fica onde|qual o local)/.test(t)) {
    const b = await prisma.barbearia.findUnique({ where: { id: barbeariaId } });
    return b && b.endereco ? `📍 Nosso endereço é: ${b.endereco}` : null;
  }

  // HORÁRIO DE FUNCIONAMENTO (nunca quando fala de agenda/data)
  if (!AGENDA.test(t) &&
    /(que horas abre|que horas fecha|horario de func|horario de atend|abre que horas|fecha que horas|funciona que horas|voces abrem|voces fecham|que horas voces|horario de voces)/.test(t)) {
    const jornadas = await prisma.horarioTrabalho.findMany({ where: { barbeariaId, trabalha: true } });
    if (!jornadas.length) return null;
    const porDia = {};
    jornadas.forEach((j) => {
      const g = porDia[j.diaSemana] || { abre: j.horaInicio, fecha: j.horaFim };
      if (j.horaInicio < g.abre) g.abre = j.horaInicio;
      if (j.horaFim > g.fecha) g.fecha = j.horaFim;
      porDia[j.diaSemana] = g;
    });
    const linhas = [0, 1, 2, 3, 4, 5, 6].filter((d) => porDia[d]).map((d) => `${DIAS_SEMANA[d]}: ${porDia[d].abre} às ${porDia[d].fecha}`);
    return `🕒 Nosso horário de funcionamento:\n${linhas.join('\n')}`;
  }

  // PREÇOS / VALORES (nunca quando fala de agenda/data)
  if (!AGENDA.test(t) &&
    /(quanto custa|qual o valor|quais os valores|tabela de preco|preco do|os precos|quanto e o|quanto fica|valor do)/.test(t)) {
    const servicos = await prisma.servico.findMany({
      where: { barbeariaId, ativo: true, ehProduto: false },
      orderBy: { nome: 'asc' },
    });
    if (!servicos.length) return null;
    const linhas = servicos.map((s) => `• ${s.nome}: ${fmtBRL(s.valor)}`);
    return `💈 Nossos serviços e valores:\n${linhas.join('\n')}\n\nQuer marcar algum? É só me dizer o dia. 🙂`;
  }

  return null;
}

module.exports = { tentarResponder };
