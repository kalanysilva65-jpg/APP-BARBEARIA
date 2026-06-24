// Rotas internas (painel da equipe). Tudo aqui exige login.
// Os módulos das próximas fases entram como "stubs" para deixar o painel
// navegável já neste checkpoint; cada um será substituído na sua fase.
const express = require('express');
const router = express.Router();
const { exigeLogin, exigeAdmin } = require('../middlewares/auth');
const prisma = require('../config/db');

// Tudo abaixo exige usuário logado.
router.use(exigeLogin);

// Painel (dashboard).
router.get('/', async (req, res) => {
  // Alerta de estoque baixo já fica visível no painel desde já (admin).
  let estoqueBaixo = [];
  if (req.session.usuario.papel === 'admin') {
    const itens = await prisma.estoque.findMany();
    estoqueBaixo = itens.filter((i) => i.quantidade <= i.quantidadeMinima);
  }
  res.render('painel/dashboard', { titulo: 'Painel', estoqueBaixo });
});

// Helper para as telas ainda não implementadas.
function emBreve(titulo, fase) {
  return (req, res) => res.render('painel/em-breve', { titulo, fase });
}

// Agenda: todos veem (funcionário a sua, admin todas) — implementação na Fase 3.
router.get('/agenda', emBreve('Agenda', 'Fase 3'));

// Áreas exclusivas do admin.
router.get('/servicos', exigeAdmin, emBreve('Serviços & Produtos', 'Fase 4'));
router.get('/estoque', exigeAdmin, emBreve('Estoque', 'Fase 5'));
router.get('/caixa', exigeAdmin, emBreve('Caixa', 'Fase 6'));
router.get('/horarios', exigeAdmin, emBreve('Horários & Bloqueios', 'Fase 3'));

module.exports = router;
