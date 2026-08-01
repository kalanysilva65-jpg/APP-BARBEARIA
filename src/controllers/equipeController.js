// Controlador da Equipe no painel comum (admin da barbearia).
// Antes só existia no painel-mestre (dono do sistema); volta pra cá porque o
// admin da própria barbearia também precisa gerenciar seu time no dia a dia.
// Exclusivo do admin (exigeAdmin nas rotas) — ver memória de permissões.
const bcrypt = require('bcryptjs');
const fs = require('fs');
const prisma = require('../config/db');
const { caminhoDoUpload } = require('../config/paths');
const { paraMinutos } = require('../services/disponibilidade');

function apagarFoto(fotoUrl) {
  const caminho = caminhoDoUpload(fotoUrl);
  if (caminho) fs.unlink(caminho, () => {});
}

// Ocupação/ticket médio do mês atual — versão enxuta do que já existe em
// comissaoController (aqui é só um resumo "de relance" no card, o relatório
// financeiro completo continua em Comissões).
async function statsDoMes(barbeariaId, barbeiros) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimExcl = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

  const agendamentos = await prisma.agendamento.findMany({
    where: { barbeariaId, status: 'concluido', data: { gte: inicio, lt: fimExcl } },
    include: { itens: { include: { servico: true } } },
  });
  const jornadas = await prisma.horarioTrabalho.findMany({ where: { barbeariaId } });
  const bloqueios = await prisma.bloqueio.findMany({ where: { barbeariaId, data: { gte: inicio, lt: fimExcl } } });

  const amanha = new Date();
  amanha.setHours(0, 0, 0, 0);
  amanha.setDate(amanha.getDate() + 1);
  const limite = new Date(Math.min(fimExcl.getTime(), amanha.getTime()));

  const porBarbeiro = new Map();
  for (const b of barbeiros) porBarbeiro.set(b.id, { faturado: 0, ocupadoMin: 0, qtd: 0, dispMin: 0, clientes: new Set(), servicos: new Map() });

  for (const ag of agendamentos) {
    const g = porBarbeiro.get(ag.usuarioId);
    if (!g) continue;
    g.qtd += 1;
    g.faturado += ag.valorTotal;
    g.ocupadoMin += ag.itens.reduce((s, it) => s + (it.servico.duracaoMin || 0) * it.quantidade, 0);
    // Cliente distinto pelo telefone normalizado: o mesmo cliente pode voltar
    // várias vezes no mês, e "clientes atendidos" conta pessoas, não visitas.
    g.clientes.add(ag.clienteTelefone || ag.clienteNome);
    ag.itens.forEach((it) => g.servicos.set(it.servico.nome, (g.servicos.get(it.servico.nome) || 0) + it.quantidade));
  }

  for (let d = new Date(inicio); d < limite; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    for (const b of barbeiros) {
      const j = jornadas.find((x) => x.usuarioId === b.id && x.diaSemana === dow);
      if (j && j.trabalha) {
        porBarbeiro.get(b.id).dispMin += Math.max(0, paraMinutos(j.horaFim) - paraMinutos(j.horaInicio));
      }
    }
  }
  for (const bl of bloqueios) {
    const g = porBarbeiro.get(bl.usuarioId);
    if (g && bl.data < limite) g.dispMin = Math.max(0, g.dispMin - Math.max(0, paraMinutos(bl.horaFim) - paraMinutos(bl.horaInicio)));
  }

  const resultado = new Map();
  for (const b of barbeiros) {
    const g = porBarbeiro.get(b.id);
    let servicoTop = null;
    let maxQtd = 0;
    g.servicos.forEach((qtd, nome) => { if (qtd > maxQtd) { maxQtd = qtd; servicoTop = nome; } });
    resultado.set(b.id, {
      faturado: g.faturado,
      atendimentos: g.qtd,
      clientesAtendidos: g.clientes.size,
      servicoTop,
      comissaoReceber: Math.round((g.faturado * (b.comissaoPercentual || 0)) / 100),
      ticketMedio: g.qtd > 0 ? Math.round(g.faturado / g.qtd) : 0,
      ocupacaoPct: g.dispMin > 0 ? Math.round((g.ocupadoMin / g.dispMin) * 100) : null,
    });
  }
  return resultado;
}

// Feed "Histórico" da tela de Equipe (Turno 6, 2026-07-28): os últimos
// atendimentos concluídos da barbearia, de todos os barbeiros juntos. É o
// resumo de relance — o relatório com comissão e período continua em Comissões.
const HISTORICO_LIMITE = 40;

async function historicoRecente(barbeariaId) {
  const agendamentos = await prisma.agendamento.findMany({
    where: { barbeariaId, status: 'concluido' },
    orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
    take: HISTORICO_LIMITE,
    include: { usuario: true, itens: { include: { servico: true } } },
  });
  return agendamentos.map((ag) => ({
    id: ag.id,
    hora: ag.horaInicio,
    data: ag.data,
    cliente: ag.clienteNome,
    item: ag.itens.map((it) => it.servico.nome).join(' + ') || 'Atendimento',
    barbeiro: ag.usuario.nome.split(' ')[0],
    valor: ag.valorTotal,
  }));
}

// GET /painel/equipe
async function listar(req, res) {
  const b = req.barbeariaId;
  const equipe = await prisma.usuario.findMany({ where: { barbeariaId: b, papel: { not: 'dono' } }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
  const stats = await statsDoMes(b, equipe);
  const vazio = { faturado: 0, atendimentos: 0, clientesAtendidos: 0, servicoTop: null, comissaoReceber: 0, ticketMedio: 0, ocupacaoPct: null };
  const membros = equipe.map((m) => ({ ...m, stats: stats.get(m.id) || vazio }));
  const historico = await historicoRecente(b);
  // `aba` vem só da querystring pra que um link possa cair direto no Histórico;
  // a troca no dia a dia é no clique, sem recarregar.
  const aba = req.query.aba === 'historico' ? 'historico' : 'equipe';
  res.render('painel/equipe', { titulo: 'Equipe', membros, historico, aba });
}

// Barbeiro é CADASTRO, não conta de acesso (pedido do dono, 2026-07-28: "só
// quem vai ter acesso sou eu"). Mas `email` e `senhaHash` são obrigatórios no
// banco (e o e-mail é único por barbearia), então geramos um par interno que
// ninguém usa pra entrar: a senha é aleatória e nunca é mostrada, o que na
// prática deixa a conta sem login utilizável.
function credenciaisInternas(nome, barbeariaId) {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '') || 'barbeiro';
  return {
    // O sufixo com timestamp garante a unicidade exigida por @@unique.
    email: `${base}.${Date.now().toString(36)}@equipe.local`,
    senha: require('crypto').randomBytes(24).toString('hex'),
  };
}

// POST /painel/equipe — cria um membro da equipe
async function criar(req, res) {
  const b = req.barbeariaId;
  const nome = (req.body.nome || '').trim();

  if (!nome) {
    req.session.flash = { tipo: 'erro', texto: 'Informe o nome do barbeiro.' };
    return res.redirect('/painel/equipe');
  }

  const { email, senha } = credenciaisInternas(nome, b);
  await prisma.usuario.create({
    data: { barbeariaId: b, nome, email, senhaHash: await bcrypt.hash(senha, 10), papel: 'funcionario' },
  });
  req.session.flash = { tipo: 'sucesso', texto: `${nome} adicionado à equipe.` };
  res.redirect('/painel/equipe');
}

// POST /painel/equipe/:id — atualiza nome/e-mail/senha/papel/comissão (+ foto, se enviada)
async function atualizar(req, res) {
  const b = req.barbeariaId;
  const id = Number(req.params.id);
  const membro = await prisma.usuario.findFirst({ where: { id, barbeariaId: b } });
  if (!membro) return res.redirect('/painel/equipe');

  const nome = (req.body.nome || '').trim();
  const comissaoPercentual = Math.min(100, Math.max(0, parseFloat(String(req.body.comissaoPercentual).replace(',', '.')) || 0));

  if (!nome) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    req.session.flash = { tipo: 'erro', texto: 'O nome é obrigatório.' };
    return res.redirect('/painel/equipe');
  }

  // E-mail, senha e papel NÃO vêm mais do formulário (o barbeiro não tem
  // login). Eles ficam de fora do `data` de propósito: derivar `papel` de um
  // campo ausente rebaixaria para "funcionario" qualquer administrador salvo
  // por aqui — inclusive o próprio dono, que perderia o acesso ao painel.
  const data = { nome, comissaoPercentual };
  if (req.file) {
    apagarFoto(membro.fotoUrl);
    data.fotoUrl = '/uploads/' + req.file.filename;
  }

  await prisma.usuario.update({ where: { id }, data });
  req.session.flash = { tipo: 'sucesso', texto: 'Membro atualizado.' };
  res.redirect('/painel/equipe');
}

// POST /painel/equipe/:id/toggle
async function alternarAtivo(req, res) {
  const membro = await prisma.usuario.findFirst({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  if (membro) await prisma.usuario.update({ where: { id: membro.id }, data: { ativo: !membro.ativo } });
  res.redirect('/painel/equipe');
}

module.exports = { listar, criar, atualizar, alternarAtivo };
