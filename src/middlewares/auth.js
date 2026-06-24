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
  if (req.session.usuario.papel !== 'admin') {
    return res.status(403).render('erro', {
      layout: 'layouts/blank',
      titulo: 'Acesso negado',
      mensagem: 'Você não tem permissão para acessar esta área.',
    });
  }
  next();
}

module.exports = { exigeLogin, exigeAdmin };
