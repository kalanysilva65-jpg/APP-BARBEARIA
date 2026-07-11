// Autenticação da CONTA DE CLIENTE (app do marketplace), com bcrypt + sessão.
//
// É uma conta GLOBAL: o e-mail é único no sistema inteiro e o login funciona em
// qualquer barbearia (diferente da equipe, cujo e-mail é único só dentro da
// barbearia). A sessão vive em `req.session.contaCliente`, isolada da equipe.
//
// As telas renderizadas aqui são um andaime funcional (Fase 0). O visual
// definitivo (design "Cortavo/Dunaro") entra na Fase 1 trocando só as views —
// a lógica deste controller não muda.
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

// Telefone -> só dígitos (ou null). Mesmo critério do cadastro local de clientes.
function normalizarTelefone(t) {
  const d = (t || '').replace(/\D/g, '');
  return d || null;
}

// E-mail com cara de e-mail (validação propositalmente simples).
function emailValido(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// O que guardamos na sessão (só o essencial, nunca o hash).
function sessao(conta) {
  return { id: conta.id, nome: conta.nome, email: conta.email };
}

// GET /conta/entrar
function mostrarLogin(req, res) {
  if (req.session.contaCliente) return res.redirect('/conta');
  res.render('conta/entrar', { layout: 'layouts/blank', titulo: 'Entrar' });
}

// GET /conta/cadastro
function mostrarCadastro(req, res) {
  if (req.session.contaCliente) return res.redirect('/conta');
  res.render('conta/cadastro', { layout: 'layouts/blank', titulo: 'Criar conta' });
}

// POST /conta/cadastro
async function cadastrar(req, res) {
  const nome = (req.body.nome || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const senha = req.body.senha || '';
  const telefone = normalizarTelefone(req.body.telefone);

  if (!nome || !emailValido(email) || senha.length < 6) {
    req.session.flash = { tipo: 'erro', texto: 'Preencha nome, um e-mail válido e uma senha de ao menos 6 caracteres.' };
    return res.redirect('/conta/cadastro');
  }

  const jaExiste = await prisma.contaCliente.findUnique({ where: { email } });
  if (jaExiste) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe uma conta com esse e-mail. Tente entrar.' };
    return res.redirect('/conta/entrar');
  }

  const conta = await prisma.contaCliente.create({
    data: { nome, email, senhaHash: bcrypt.hashSync(senha, 10), telefone },
  });
  req.session.contaCliente = sessao(conta);
  res.redirect('/conta');
}

// POST /conta/entrar
async function login(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const senha = req.body.senha || '';

  const conta = await prisma.contaCliente.findUnique({ where: { email } });
  // Mensagem genérica de propósito (não revela se o e-mail existe).
  const invalido = !conta || !conta.ativo || !bcrypt.compareSync(senha, conta.senhaHash);
  if (invalido) {
    req.session.flash = { tipo: 'erro', texto: 'E-mail ou senha inválidos.' };
    return res.redirect('/conta/entrar');
  }

  req.session.contaCliente = sessao(conta);
  res.redirect('/conta');
}

// POST /conta/sair — encerra só a sessão do cliente, preservando o resto.
function logout(req, res) {
  delete req.session.contaCliente;
  res.redirect('/conta/entrar');
}

module.exports = { mostrarLogin, mostrarCadastro, cadastrar, login, logout };
