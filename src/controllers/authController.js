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
    // Layout próprio (não o `blank`): o login da equipe foi para o design
    // "suave" e o `blank` ainda serve as páginas de conta do cliente.
    layout: 'layouts/auth',
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

  // Senha provisória (padrão de fábrica ou criada pelo admin): o guard global
  // vai forçar a tela de troca antes de liberar qualquer área. A marca fica na
  // sessão pra não reler o banco a cada request.
  req.session.trocarSenha = !!usuario.senhaProvisoria;

  // "Manter conectado" (pedido do dono, 2026-08-01): estende o cookie de 8h
  // para 30 dias. Sem marcar, segue o padrão curto — é o dono numa máquina
  // possivelmente compartilhada com a equipe, então a escolha é dele, não
  // um padrão que o mantém logado para sempre.
  if (req.body.manterConectado) {
    req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
  }
  res.redirect(destino(usuario));
}

// Encerra a sessão.
function logout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

// Tela de definir uma senha nova (troca obrigatória de senha provisória).
function mostrarTrocaSenha(req, res) {
  if (!req.session.usuario) return res.redirect('/login');
  res.render('auth/trocar-senha', {
    layout: 'layouts/auth',
    titulo: 'Defina sua senha',
    barbearia: req.barbearia || null,
    obrigatoria: !!req.session.trocarSenha,
  });
}

// Processa a troca de senha. Exige a senha atual (a provisória), uma nova de ao
// menos 8 caracteres e diferente da atual. Ao concluir, limpa a marca de
// provisória no banco e na sessão e leva o usuário para a sua área.
async function trocarSenha(req, res) {
  if (!req.session.usuario) return res.redirect('/login');
  const atual = req.body.senhaAtual || '';
  const nova = req.body.novaSenha || '';
  const conf = req.body.confirmar || '';

  const erro = (texto) => {
    req.session.flash = { tipo: 'erro', texto };
    return res.redirect('/trocar-senha');
  };

  const usuario = await prisma.usuario.findUnique({ where: { id: req.session.usuario.id } });
  if (!usuario) return req.session.destroy(() => res.redirect('/login'));

  if (!bcrypt.compareSync(atual, usuario.senhaHash)) return erro('Senha atual incorreta.');
  if (nova.length < 8) return erro('A nova senha precisa ter ao menos 8 caracteres.');
  if (nova !== conf) return erro('A confirmação não bate com a nova senha.');
  if (bcrypt.compareSync(nova, usuario.senhaHash)) return erro('A nova senha precisa ser diferente da atual.');

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: bcrypt.hashSync(nova, 10), senhaProvisoria: false },
  });
  req.session.trocarSenha = false;
  req.session.flash = { tipo: 'sucesso', texto: 'Senha atualizada com sucesso.' };
  res.redirect(destino(usuario));
}

module.exports = { mostrarLogin, fazerLogin, logout, mostrarTrocaSenha, trocarSenha };
