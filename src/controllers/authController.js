// Controlador de autenticação (login/logout) com bcrypt + sessão.
// Multi-tenant: a autenticação é feita DENTRO da barbearia do contexto
// (subdomínio). O dono do sistema (papel "dono") loga sem barbearia e cai no
// painel-mestre.
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

// Para onde mandar cada perfil depois do login.
function destino(usuario) {
  return usuario.papel === 'dono' ? '/mestre' : '/painel';
}

// Tela de login.
function mostrarLogin(req, res) {
  if (req.session.usuario) return res.redirect(destino(req.session.usuario));
  res.render('auth/login', {
    layout: 'layouts/blank',
    titulo: 'Entrar',
    barbearia: req.barbearia || null,
  });
}

// Localiza o usuário que está tentando logar, conforme o contexto.
async function localizarUsuario(email, req) {
  // Um subdomínio/slug foi informado mas NÃO resolveu para uma barbearia ativa
  // (inexistente ou inativa): bloqueia o login.
  if (req.slugBarbearia && !req.barbearia) return null;
  // Com barbearia no contexto, autentica dentro dela.
  if (req.barbearia) {
    return prisma.usuario.findUnique({
      where: { barbeariaId_email: { barbeariaId: req.barbearia.id, email } },
    });
  }

  // Sem barbearia no contexto (domínio raiz): primeiro o dono do sistema.
  const dono = await prisma.usuario.findFirst({ where: { barbeariaId: null, email } });
  if (dono) return dono;

  // A equipe das barbearias também precisa entrar pelo domínio raiz enquanto os
  // subdomínios não estiverem no ar. O e-mail é único por barbearia, não global:
  // se o mesmo e-mail existir em mais de uma, o contexto é ambíguo e o login só
  // pode ser feito pelo subdomínio da barbearia.
  const candidatos = await prisma.usuario.findMany({ where: { email, ativo: true }, take: 2 });
  return candidatos.length === 1 ? candidatos[0] : null;
}

// Processa o login.
async function fazerLogin(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  const senha = req.body.senha || '';

  const usuario = await localizarUsuario(email, req);

  // Mensagem genérica de propósito (não revela se o e-mail existe).
  const invalido = !usuario || !usuario.ativo || !bcrypt.compareSync(senha, usuario.senhaHash);
  if (invalido) {
    req.session.flash = { tipo: 'erro', texto: 'E-mail ou senha inválidos.' };
    return res.redirect('/login');
  }

  // Guarda só o essencial na sessão (inclui a barbearia do usuário).
  req.session.usuario = {
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel,
    barbeariaId: usuario.barbeariaId,
  };
  res.redirect(destino(usuario));
}

// Encerra a sessão.
function logout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

module.exports = { mostrarLogin, fazerLogin, logout };
