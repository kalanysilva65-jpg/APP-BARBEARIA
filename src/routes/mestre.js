// Rotas do painel-mestre (dono do sistema). Tudo aqui exige o papel "dono".
const express = require('express');
const router = express.Router();
const { exigeDono } = require('../middlewares/auth');
const mestreController = require('../controllers/mestreController');
const upload = require('../middlewares/upload');

router.use(exigeDono);

// Envolve o upload do logo tratando erros com mensagem amigável (volta ao detalhe).
function uploadLogo(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      req.session.flash = { tipo: 'erro', texto: err.message || 'Falha no upload do logo.' };
      return res.redirect('/mestre/barbearias/' + req.params.id);
    }
    next();
  });
}

// Lista + criação de barbearias
router.get('/', mestreController.painel);
router.get('/nova', mestreController.formNova);
router.post('/barbearias', mestreController.criarBarbearia);

// Impersonação
router.post('/entrar/:id', mestreController.entrar);
router.post('/sair', mestreController.sair);

// Detalhe / edição de uma barbearia
router.get('/barbearias/:id', mestreController.detalhe);
router.post('/barbearias/:id', mestreController.atualizarBarbearia);
router.post('/barbearias/:id/remover', mestreController.removerBarbearia);

// Equipe da barbearia (barbeiros + e-mail/senha)
router.post('/barbearias/:id/equipe', mestreController.criarBarbeiro);
router.get('/barbearias/:id/equipe/:uid/editar', mestreController.formEditarBarbeiro);
router.post('/barbearias/:id/equipe/:uid', mestreController.atualizarBarbeiro);
router.post('/barbearias/:id/equipe/:uid/toggle', mestreController.toggleBarbeiro);

// Marca (logo + powered-by) da barbearia
router.post('/barbearias/:id/marca', uploadLogo, mestreController.salvarMarca);
router.post('/barbearias/:id/marca/remover-logo', mestreController.removerLogo);

module.exports = router;
