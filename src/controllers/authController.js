// Controlador de autenticação (login/logout) com bcrypt + sessão.
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

// Tela de login.
function mostrarLogin(req, res) {
  if (req.session.usuario) return res.redirect('/painel');
  res.render('auth/login', { layout: 'layouts/blank', titulo: 'Entrar' });
}

// Processa o login.
async function fazerLogin(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const senha = req.body.senha || '';

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  // Mensagem genérica de propósito (não revela se o e-mail existe).
  const invalido = !usuario || !usuario.ativo || !bcrypt.compareSync(senha, usuario.senhaHash);
  if (invalido) {
    req.session.flash = { tipo: 'erro', texto: 'E-mail ou senha inválidos.' };
    return res.redirect('/login');
  }

  // Guarda só o essencial na sessão.
  req.session.usuario = { id: usuario.id, nome: usuario.nome, papel: usuario.papel };
  res.redirect('/painel');
}

// Encerra a sessão.
function logout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

module.exports = { mostrarLogin, fazerLogin, logout };
