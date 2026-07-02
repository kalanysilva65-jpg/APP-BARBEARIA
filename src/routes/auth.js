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

router.get('/login', authController.mostrarLogin);
router.post('/login', authController.fazerLogin);
router.post('/logout', authController.logout);

module.exports = router;
