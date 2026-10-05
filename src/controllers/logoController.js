// Logo do agendamento público — editada pelo DONO DA BARBEARIA (admin), dentro
// do app: adicionar, trocar, mudar a posição/tamanho e excluir. (O painel-mestre
// continua podendo mexer na logo também; ambos usam as mesmas chaves em
// `Configuracao`: logo_url, logo_alinhamento, logo_tamanho.)
const fs = require('fs');
const prisma = require('../config/db');
const { caminhoDoUpload } = require('../config/paths');
const { lerMarca } = require('./configuracaoMarcaController');

const gravar = (barbeariaId, chave, valor) => prisma.configuracao.upsert({
  where: { barbeariaId_chave: { barbeariaId, chave } },
  update: { valor: String(valor) },
  create: { barbeariaId, chave, valor: String(valor) },
});

// GET /painel/logo
async function ver(req, res) {
  const marca = await lerMarca(req.barbeariaId);
  res.render('painel/logo', { titulo: 'Logo do agendamento', marca });
}

// POST /painel/logo — foto nova (opcional), posição e tamanho.
async function salvar(req, res) {
  const b = req.barbeariaId;
  const alinh = ['esquerda', 'centro', 'direita'].includes(req.body.alinhamento) ? req.body.alinhamento : 'centro';
  const tam = Math.min(240, Math.max(80, parseInt(req.body.tamanho, 10) || 168));
  await gravar(b, 'logo_alinhamento', alinh);
  await gravar(b, 'logo_tamanho', tam);
  if (req.file) {
    const atual = await prisma.configuracao.findUnique({ where: { barbeariaId_chave: { barbeariaId: b, chave: 'logo_url' } } });
    const anterior = atual && caminhoDoUpload(atual.valor);
    if (anterior) fs.unlink(anterior, () => {});
    await gravar(b, 'logo_url', '/uploads/' + req.file.filename);
  }
  req.session.flash = { tipo: 'sucesso', texto: 'Logo atualizada.' };
  res.redirect('/painel/logo');
}

// POST /painel/logo/remover
async function remover(req, res) {
  const b = req.barbeariaId;
  const atual = await prisma.configuracao.findUnique({ where: { barbeariaId_chave: { barbeariaId: b, chave: 'logo_url' } } });
  if (atual && atual.valor) {
    const arq = caminhoDoUpload(atual.valor);
    if (arq) fs.unlink(arq, () => {});
    await gravar(b, 'logo_url', '');
  }
  req.session.flash = { tipo: 'sucesso', texto: 'Logo removida.' };
  res.redirect('/painel/logo');
}

module.exports = { ver, salvar, remover };
