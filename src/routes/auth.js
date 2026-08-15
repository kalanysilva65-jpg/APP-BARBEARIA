// Rotas de autenticação e entrada do app.
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Raiz: dono -> painel-mestre; equipe logada -> painel; visitante -> agendamento.
router.get('/', (req, res) => {
  const u = req.session.usuario;
  if (u) return res.redirect(u.papel === 'dono' ? '/mestre' : '/painel');
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
