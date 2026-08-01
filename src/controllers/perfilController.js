// Perfil do usuário logado (foto, cargo e jornada).
const fs = require('fs');
const prisma = require('../config/db');
const { caminhoDoUpload } = require('../config/paths');
const { resumoJornada } = require('./horarioController');

const NOME_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// A semana aparece começando na segunda, como no resto do painel.
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

// "09:30" -> 570. Hora inválida vira 0 (o cálculo de horas ignora o dia).
function minutosDe(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// GET /painel/mais — perfil do usuário logado.
async function ver(req, res) {
  const usuario = req.session.usuario;
  let atendimentos = 0;
  let horarioTrabalho = null;
  let jornada = [];

  if (usuario.barbeariaId) {
    atendimentos = await prisma.agendamentoItem.count({
      where: { agendamento: { usuarioId: usuario.id, status: 'concluido' } },
    }).catch(() => 0);

    const registros = await prisma.horarioTrabalho.findMany({ where: { usuarioId: usuario.id } });
    horarioTrabalho = resumoJornada(registros);

    // Uma linha por dia da semana, na ordem de exibição — o design Turno 6
    // mostra os dias como selos e o expediente dia a dia (pedido do dono,
    // 2026-07-28), enquanto a jornada em si continua sendo editada em
    // /painel/horarios.
    const porDia = new Array(7).fill(null);
    registros.forEach((r) => { porDia[r.diaSemana] = r; });
    jornada = ORDEM_SEMANA.map((i) => {
      const r = porDia[i];
      return {
        label: NOME_DIA[i],
        trabalha: !!(r && r.trabalha),
        horaInicio: r ? r.horaInicio : null,
        horaFim: r ? r.horaFim : null,
      };
    });
  }

  const diasAtivos = jornada.filter((d) => d.trabalha);
  const minutosSemana = diasAtivos.reduce(
    (soma, d) => soma + Math.max(0, minutosDe(d.horaFim) - minutosDe(d.horaInicio)),
    0,
  );
  const semana = {
    horas: Math.floor(minutosSemana / 60) + 'h',
    dias: diasAtivos.length,
    // Sem dia nenhum marcado não há "horas por dia" — a linha vira um aviso.
    linha: diasAtivos.length
      ? `${diasAtivos.length} dia${diasAtivos.length === 1 ? '' : 's'} de trabalho · ` +
        `${Math.round(minutosSemana / 60 / diasAtivos.length)}h por dia`
      : 'Nenhum dia de trabalho definido',
  };

  res.render('painel/mais', { titulo: 'Perfil', atendimentos, horarioTrabalho, jornada, semana });
}

// POST /painel/perfil/foto — o próprio usuário logado troca sua foto.
async function salvarFoto(req, res) {
  const destino = req.get('Referer') || '/painel';
  const id = req.session.usuario.id;

  if (!req.file) return res.redirect(destino);

  const atual = await prisma.usuario.findUnique({ where: { id } });
  const anterior = atual && caminhoDoUpload(atual.fotoUrl);
  if (anterior) fs.unlink(anterior, () => {});
  await prisma.usuario.update({ where: { id }, data: { fotoUrl: '/uploads/' + req.file.filename } });
  req.session.flash = { tipo: 'sucesso', texto: 'Foto atualizada.' };
  res.redirect(destino);
}

module.exports = { ver, salvarFoto };
