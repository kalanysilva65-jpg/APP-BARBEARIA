const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

async function listar(req, res) {
  const membros = await prisma.usuario.findMany({ orderBy: { nome: 'asc' } });
  res.render('painel/equipe', { titulo: 'Equipe', membros });
}

function formNovo(req, res) {
  res.render('painel/equipe-form', { titulo: 'Novo barbeiro', membro: null });
}

async function criar(req, res) {
  const nome = (req.body.nome || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const senha = req.body.senha || '';
  const papel = req.body.papel === 'admin' ? 'admin' : 'funcionario';

  if (!nome || !email || senha.length < 6) {
    req.session.flash = { tipo: 'erro', texto: 'Preencha nome, e-mail e senha (mínimo 6 caracteres).' };
    return res.redirect('/painel/equipe/novo');
  }

  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um usuário com esse e-mail.' };
    return res.redirect('/painel/equipe/novo');
  }

  const senhaHash = await bcrypt.hash(senha, 10);
  await prisma.usuario.create({ data: { nome, email, senhaHash, papel } });

  req.session.flash = { tipo: 'sucesso', texto: `${nome} adicionado à equipe.` };
  res.redirect('/painel/equipe');
}

async function formEditar(req, res) {
  const membro = await prisma.usuario.findUnique({ where: { id: Number(req.params.id) } });
  if (!membro) return res.redirect('/painel/equipe');
  res.render('painel/equipe-form', { titulo: 'Editar barbeiro', membro });
}

async function atualizar(req, res) {
  const id = Number(req.params.id);
  const nome = (req.body.nome || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const papel = req.body.papel === 'admin' ? 'admin' : 'funcionario';
  const senha = req.body.senha || '';

  if (!nome || !email) {
    req.session.flash = { tipo: 'erro', texto: 'Nome e e-mail são obrigatórios.' };
    return res.redirect(`/painel/equipe/${id}/editar`);
  }

  const conflito = await prisma.usuario.findFirst({ where: { email, NOT: { id } } });
  if (conflito) {
    req.session.flash = { tipo: 'erro', texto: 'Esse e-mail já está em uso por outro usuário.' };
    return res.redirect(`/painel/equipe/${id}/editar`);
  }

  const data = { nome, email, papel };
  if (senha.length >= 6) data.senhaHash = await bcrypt.hash(senha, 10);

  await prisma.usuario.update({ where: { id }, data });
  req.session.flash = { tipo: 'sucesso', texto: 'Dados atualizados.' };
  res.redirect('/painel/equipe');
}

async function alternarAtivo(req, res) {
  const id = Number(req.params.id);
  // Impede o admin de desativar a si mesmo.
  if (id === req.session.usuario.id) {
    req.session.flash = { tipo: 'erro', texto: 'Você não pode desativar sua própria conta.' };
    return res.redirect('/painel/equipe');
  }
  const atual = await prisma.usuario.findUnique({ where: { id } });
  await prisma.usuario.update({ where: { id }, data: { ativo: !atual.ativo } });
  res.redirect('/painel/equipe');
}

module.exports = { listar, formNovo, criar, formEditar, atualizar, alternarAtivo };
