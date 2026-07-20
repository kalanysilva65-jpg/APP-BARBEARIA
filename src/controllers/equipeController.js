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
  for (const b of barbeiros) porBarbeiro.set(b.id, { faturado: 0, ocupadoMin: 0, qtd: 0, dispMin: 0 });

  for (const ag of agendamentos) {
    const g = porBarbeiro.get(ag.usuarioId);
    if (!g) continue;
    g.qtd += 1;
    g.faturado += ag.valorTotal;
    g.ocupadoMin += ag.itens.reduce((s, it) => s + (it.servico.duracaoMin || 0) * it.quantidade, 0);
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
    resultado.set(b.id, {
      ticketMedio: g.qtd > 0 ? Math.round(g.faturado / g.qtd) : 0,
      ocupacaoPct: g.dispMin > 0 ? Math.round((g.ocupadoMin / g.dispMin) * 100) : null,
    });
  }
  return resultado;
}

// GET /painel/equipe
async function listar(req, res) {
  const b = req.barbeariaId;
  const equipe = await prisma.usuario.findMany({ where: { barbeariaId: b, papel: { not: 'dono' } }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
  const stats = await statsDoMes(b, equipe);
  const membros = equipe.map((m) => ({ ...m, stats: stats.get(m.id) || { ticketMedio: 0, ocupacaoPct: null } }));
  res.render('painel/equipe', { titulo: 'Equipe', membros });
}

// POST /painel/equipe — cria um membro (barbeiro/admin) da equipe
async function criar(req, res) {
  const b = req.barbeariaId;
  const nome = (req.body.nome || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const senha = req.body.senha || '';
  const papel = req.body.papel === 'admin' ? 'admin' : 'funcionario';

  if (!nome || !email || senha.length < 6) {
    req.session.flash = { tipo: 'erro', texto: 'Preencha nome, e-mail e senha (mínimo 6 caracteres).' };
    return res.redirect('/painel/equipe');
  }
  const existe = await prisma.usuario.findUnique({ where: { barbeariaId_email: { barbeariaId: b, email } } });
  if (existe) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um usuário com esse e-mail nesta barbearia.' };
    return res.redirect('/painel/equipe');
  }

  await prisma.usuario.create({ data: { barbeariaId: b, nome, email, senhaHash: await bcrypt.hash(senha, 10), papel } });
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
  const email = (req.body.email || '').trim().toLowerCase();
  const papel = req.body.papel === 'admin' ? 'admin' : 'funcionario';
  const senha = req.body.senha || '';
  const comissaoPercentual = Math.min(100, Math.max(0, parseFloat(String(req.body.comissaoPercentual).replace(',', '.')) || 0));

  if (!nome || !email) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    req.session.flash = { tipo: 'erro', texto: 'Nome e e-mail são obrigatórios.' };
    return res.redirect('/painel/equipe');
  }
  if (senha && senha.length < 6) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    req.session.flash = { tipo: 'erro', texto: 'A nova senha precisa de no mínimo 6 caracteres.' };
    return res.redirect('/painel/equipe');
  }
  const conflito = await prisma.usuario.findFirst({ where: { barbeariaId: b, email, NOT: { id } } });
  if (conflito) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    req.session.flash = { tipo: 'erro', texto: 'Esse e-mail já está em uso por outro usuário desta barbearia.' };
    return res.redirect('/painel/equipe');
  }

  const data = { nome, email, papel, comissaoPercentual };
  if (senha) data.senhaHash = await bcrypt.hash(senha, 10);
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
