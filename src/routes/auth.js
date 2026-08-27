// Rotas de autenticação e entrada do app.
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Raiz: dono -> painel-mestre; equipe logada -> painel; visitante -> depende
// do contexto (ver abaixo).
router.get('/', (req, res) => {
  const u = req.session.usuario;
  if (u) return res.redirect(u.papel === 'dono' ? '/mestre' : '/painel');

  // Sem barbearia no contexto = domínio RAIZ (cortavo.com.br sem subdomínio).
  // É assim que o APP DA EQUIPE abre: ele carrega a raiz. Mandar um visitante
  // não logado para /agendar aqui levava direto para "Barbearia não
  // encontrada" (o agendamento público exige uma barbearia no subdomínio), e
  // o app travava nessa tela logo na abertura — o revisor da Apple nunca
  // chegava no login (rejeição 2.1a, 2026-08-27). Na raiz, o destino certo é
  // o login da equipe.
  //
  // Num subdomínio de barbearia (andrade.cortavo.com.br) req.barbearia existe,
  // e aí o comportamento continua o de antes: o cliente cai no agendamento.
  if (!req.barbearia) return res.redirect('/login');
  res.redirect('/agendar');
});

// Política de privacidade — pública e SEM login de propósito: a App Store e a
// Play Store exigem uma URL aberta no formulário de submissão, e o revisor
// precisa conseguir abri-la sem conta.
router.get('/privacidade', (req, res) => {
  res.render('legal/privacidade', {
    layout: 'layouts/blank',
    titulo: 'Política de Privacidade',
    atualizadoEm: '13 de agosto de 2026',
    emailContato: process.env.EMAIL_CONTATO || 'kalanysilva65@gmail.com',
  });
});

router.get('/login', authController.mostrarLogin);
router.post('/login', authController.fazerLogin);
router.post('/logout', authController.logout);

module.exports = router;
