// Controlador da identidade visual da barbearia (logo + selo Powered by Navio).
// Acesso exclusivo do admin. Usa a tabela `configuracoes` (chave/valor)
// com as chaves `logo_url` e `mostrar_powered_by`, igual ao padrão de
// `caixa_automatico` já existente.
const prisma = require('../config/db');
const path = require('path');
const fs = require('fs');

// Lê as duas configurações de marca do banco.
// Retorna { logoUrl: string|null, mostrarPoweredBy: boolean }
async function lerMarca() {
  const registros = await prisma.configuracao.findMany({
    where: { chave: { in: ['logo_url', 'mostrar_powered_by'] } },
  });
  const mapa = Object.fromEntries(registros.map((r) => [r.chave, r.valor]));
  return {
    logoUrl: mapa['logo_url'] || null,
    mostrarPoweredBy: mapa['mostrar_powered_by'] !== 'false', // padrão true
  };
}

// GET /painel/configuracoes-marca
async function ver(req, res) {
  const marca = await lerMarca();
  res.render('painel/configuracoes-marca', {
    titulo: 'Identidade da marca',
    logoUrl: marca.logoUrl,
    mostrarPoweredBy: marca.mostrarPoweredBy,
  });
}

// POST /painel/configuracoes-marca
async function salvar(req, res) {
  const mostrarPoweredBy = req.body.mostrar_powered_by === 'on';

  // Persiste o toggle independentemente do upload.
  await prisma.configuracao.upsert({
    where: { chave: 'mostrar_powered_by' },
    update: { valor: String(mostrarPoweredBy) },
    create: { chave: 'mostrar_powered_by', valor: String(mostrarPoweredBy) },
  });

  if (req.file) {
    // Apaga logo anterior se existir.
    const atual = await prisma.configuracao.findUnique({ where: { chave: 'logo_url' } });
    if (atual && atual.valor) {
      const caminho = path.join(__dirname, '..', '..', atual.valor.replace(/^\//, ''));
      fs.unlink(caminho, () => {}); // silencioso se não existir
    }

    const novoUrl = '/uploads/' + req.file.filename;
    await prisma.configuracao.upsert({
      where: { chave: 'logo_url' },
      update: { valor: novoUrl },
      create: { chave: 'logo_url', valor: novoUrl },
    });
  }

  req.session.flash = { tipo: 'sucesso', texto: 'Configurações de marca salvas.' };
  res.redirect('/painel/configuracoes-marca');
}

// POST /painel/configuracoes-marca/remover-logo
async function removerLogo(req, res) {
  const atual = await prisma.configuracao.findUnique({ where: { chave: 'logo_url' } });
  if (atual && atual.valor) {
    const caminho = path.join(__dirname, '..', '..', atual.valor.replace(/^\//, ''));
    fs.unlink(caminho, () => {});
    await prisma.configuracao.update({ where: { chave: 'logo_url' }, data: { valor: '' } });
  }
  req.session.flash = { tipo: 'sucesso', texto: 'Logo removido.' };
  res.redirect('/painel/configuracoes-marca');
}

module.exports = { ver, salvar, removerLogo, lerMarca };
