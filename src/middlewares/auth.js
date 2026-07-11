// Middlewares de autenticação e autorização.
// A verificação de permissão fica SEMPRE no backend — nunca confiamos só no frontend.

// Exige que exista um usuário logado na sessão.
function exigeLogin(req, res, next) {
  if (!req.session.usuario) {
    req.session.flash = { tipo: 'erro', texto: 'Faça login para continuar.' };
    return res.redirect('/login');
  }
  next();
}

// Exige que o usuário logado seja admin (chefe).
// Funcionários não acessam estoque, caixa, serviços nem configurações.
function exigeAdmin(req, res, next) {
  if (!req.session.usuario) {
    req.session.flash = { tipo: 'erro', texto: 'Faça login para continuar.' };
    return res.redirect('/login');
  }
  // O dono do sistema, ao operar uma barbearia, tem poderes de admin.
  if (req.session.usuario.papel !== 'admin' && req.session.usuario.papel !== 'dono') {
    return res.status(403).render('erro', {
      layout: 'layouts/blank',
      titulo: 'Acesso negado',
      mensagem: 'Você não tem permissão para acessar esta área.',
    });
  }
  next();
}

// Exige que o usuário logado seja o DONO do sistema (super-admin do SaaS).
function exigeDono(req, res, next) {
  if (!req.session.usuario) {
    req.session.flash = { tipo: 'erro', texto: 'Faça login para continuar.' };
    return res.redirect('/login');
  }
  if (req.session.usuario.papel !== 'dono') {
    return res.status(403).render('erro', {
      layout: 'layouts/blank',
      titulo: 'Acesso negado',
      mensagem: 'Área exclusiva do administrador do sistema.',
    });
  }
  next();
}

// --- Conta de cliente (app do marketplace) --------------------------------
// A conta de cliente é uma sessão SEPARADA da equipe: vive em
// `req.session.contaCliente`, nunca em `req.session.usuario`. Assim um cliente
// e um membro da equipe podem estar logados no mesmo navegador sem se misturar,
// e nenhuma rota de cliente concede acesso ao painel (e vice-versa).
function exigeContaCliente(req, res, next) {
  if (!req.session.contaCliente) {
    req.session.flash = { tipo: 'erro', texto: 'Entre na sua conta para continuar.' };
    return res.redirect('/conta/entrar');
  }
  next();
}

module.exports = { exigeLogin, exigeAdmin, exigeDono, exigeContaCliente };
