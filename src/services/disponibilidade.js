// Serviço de cálculo de disponibilidade de horários por barbeiro.
// Cada barbeiro tem agenda independente: o cálculo considera a jornada do dia,
// os agendamentos ativos e os bloqueios manuais daquele barbeiro.
const prisma = require('../config/db');
const { INTERVALO_SLOT_MIN } = require('../config/constantes');

// "HH:MM" -> minutos desde 00:00
function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// minutos -> "HH:MM"
function paraHHMM(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// "YYYY-MM-DD" -> Date à meia-noite local (usado de forma consistente em todo o app)
function dataLocal(yyyymmdd) {
  const [ano, mes, dia] = yyyymmdd.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

// Duração efetiva para fins de agenda: produtos (0 min) ocupam ao menos um intervalo.
function duracaoEfetiva(duracaoMin) {
  return duracaoMin && duracaoMin > 0 ? duracaoMin : INTERVALO_SLOT_MIN;
}

// Calcula os horários (slots) livres de um barbeiro numa data, para um serviço.
// Retorna um array de strings "HH:MM".
async function horariosDisponiveis(barbeiroId, dataStr, duracaoServico) {
  const data = dataLocal(dataStr);
  const diaSemana = data.getDay(); // 0 = domingo

  // Jornada do barbeiro nesse dia da semana
  const jornada = await prisma.horarioTrabalho.findFirst({
    where: { usuarioId: barbeiroId, diaSemana },
  });
  if (!jornada || !jornada.trabalha) return [];

  const inicioExpediente = paraMinutos(jornada.horaInicio);
  const fimExpediente = paraMinutos(jornada.horaFim);
  const duracao = duracaoEfetiva(duracaoServico);

  // Intervalos já ocupados: agendamentos ativos + bloqueios manuais
  const ocupados = [];

  const agendamentos = await prisma.agendamento.findMany({
    where: { usuarioId: barbeiroId, data, status: { not: 'cancelado' } },
    include: { itens: { include: { servico: true } } },
  });
  for (const ag of agendamentos) {
    const ini = paraMinutos(ag.horaInicio);
    // duração do agendamento = soma das durações dos seus itens
    const dur =
      ag.itens.reduce((s, it) => s + duracaoEfetiva(it.servico.duracaoMin) * it.quantidade, 0) ||
      INTERVALO_SLOT_MIN;
    ocupados.push([ini, ini + dur]);
  }

  const bloqueios = await prisma.bloqueio.findMany({
    where: { usuarioId: barbeiroId, data },
  });
  for (const b of bloqueios) {
    ocupados.push([paraMinutos(b.horaInicio), paraMinutos(b.horaFim)]);
  }

  // Se a data for hoje, escondemos horários que já passaram
  const agora = new Date();
  const ehHoje = data.toDateString() === agora.toDateString();
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes();

  const slots = [];
  for (let t = inicioExpediente; t + duracao <= fimExpediente; t += INTERVALO_SLOT_MIN) {
    const fim = t + duracao;
    // não pode sobrepor nenhum intervalo ocupado
    const conflita = ocupados.some(([oIni, oFim]) => t < oFim && oIni < fim);
    if (conflita) continue;
    // se hoje, só horários futuros
    if (ehHoje && t <= minutoAgora) continue;
    slots.push(paraHHMM(t));
  }
  return slots;
}

module.exports = { horariosDisponiveis, dataLocal, paraMinutos, paraHHMM, duracaoEfetiva };
