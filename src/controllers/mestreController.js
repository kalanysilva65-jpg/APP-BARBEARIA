// Painel-mestre: área exclusiva do DONO do sistema (super-admin do SaaS).
// Gerencia as barbearias assinantes: criar/editar, equipe (barbeiros + e-mail/senha),
// marca (logo/powered-by) e a operação (impersonação) de cada uma.
const bcrypt = require('bcryptjs');
const fs = require('fs');
const prisma = require('../config/db');
const { caminhoDoUpload } = require('../config/paths');
const { geocodificar } = require('../services/geocodificacao');

// Normaliza um slug de subdomínio: minúsculas, sem acentos, só [a-z0-9-].
function normalizarSlug(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

// Lê a marca (logo + powered by) de uma barbearia.
async function lerMarca(barbeariaId) {
  const registros = await prisma.configuracao.findMany({
    where: { barbeariaId, chave: { in: ['logo_url', 'mostrar_powered_by'] } },
  });
  const mapa = Object.fromEntries(registros.map((r) => [r.chave, r.valor]));
  return { logoUrl: mapa['logo_url'] || null, mostrarPoweredBy: mapa['mostrar_powered_by'] !== 'false' };
}

// Garante as 3 configurações padrão de uma barbearia recém-criada.
async function criarConfigsPadrao(barbeariaId) {
  const padroes = [
    ['caixa_automatico', 'false'],
    ['logo_url', ''],
    ['mostrar_powered_by', 'true'],
  ];
  for (const [chave, valor] of padroes) {
    await prisma.configuracao.upsert({
      where: { barbeariaId_chave: { barbeariaId, chave } },
      update: {},
      create: { barbeariaId, chave, valor },
    });
  }
}

// GET /mestre — lista de barbearias com um resumo.
async function painel(req, res) {
  const barbearias = await prisma.barbearia.findMany({
    orderBy: { criadoEm: 'desc' },
    include: { _count: { select: { usuarios: true, clientes: true, agendamentos: true } } },
  });
  res.render('mestre/painel', { layout: 'layouts/mestre', titulo: 'Painel-mestre', barbearias });
}

// GET /mestre/nova — formulário de nova barbearia (+ primeiro admin).
function formNova(req, res) {
  res.render('mestre/barbearia-nova', { layout: 'layouts/mestre', titulo: 'Nova barbearia', valores: null, erro: null });
}

// POST /mestre/barbearias — cria a barbearia e o admin inicial.
async function criarBarbearia(req, res) {
  const nome = (req.body.nome || '').trim();
  const slug = normalizarSlug(req.body.slug || nome);
  const adminNome = (req.body.adminNome || '').trim();
  const adminEmail = (req.body.adminEmail || '').trim().toLowerCase();
  const adminSenha = req.body.adminSenha || '';

  const erros = [];
  if (!nome) erros.push('Informe o nome da barbearia.');
  if (!slug) erros.push('Informe um subdomínio válido.');
  if (!adminNome) erros.push('Informe o nome do admin.');
  if (!adminEmail) erros.push('Informe o e-mail do admin.');
  if (adminSenha.length < 6) erros.push('A senha do admin precisa de no mínimo 6 caracteres.');
  if (slug && (await prisma.barbearia.findUnique({ where: { slug } }))) {
    erros.push('Já existe uma barbearia com esse subdomínio.');
  }

  if (erros.length) {
    return res.render('mestre/barbearia-nova', {
      layout: 'layouts/mestre',
      titulo: 'Nova barbearia',
      valores: req.body,
      erro: erros.join(' '),
    });
  }

  const barbearia = await prisma.barbearia.create({ data: { nome, slug } });
  await prisma.usuario.create({
    data: {
      barbeariaId: barbearia.id,
      nome: adminNome,
      email: adminEmail,
      senhaHash: await bcrypt.hash(adminSenha, 10),
      papel: 'admin',
    },
  });
  await criarConfigsPadrao(barbearia.id);

  req.session.flash = { tipo: 'sucesso', texto: 'Barbearia criada.' };
  res.redirect('/mestre/barbearias/' + barbearia.id);
}

// Carrega a barbearia do parâmetro ou redireciona.
async function carregarBarbearia(req, res) {
  const barbearia = await prisma.barbearia.findUnique({ where: { id: Number(req.params.id) } });
  if (!barbearia) {
    req.session.flash = { tipo: 'erro', texto: 'Barbearia não encontrada.' };
    res.redirect('/mestre');
    return null;
  }
  return barbearia;
}

// GET /mestre/barbearias/:id — detalhe (editar barbearia + equipe + marca).
async function detalhe(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;

  const equipe = await prisma.usuario.findMany({
    where: { barbeariaId: barbearia.id },
    orderBy: [{ papel: 'asc' }, { nome: 'asc' }],
  });
  const marca = await lerMarca(barbearia.id);

  res.render('mestre/barbearia-detalhe', {
    layout: 'layouts/mestre',
    titulo: barbearia.nome,
    barbearia,
    equipe,
    marca,
  });
}

// POST /mestre/barbearias/:id — atualiza nome/slug/ativo/endereço.
async function atualizarBarbearia(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;

  const nome = (req.body.nome || '').trim();
  const slug = normalizarSlug(req.body.slug || nome);
  const ativo = req.body.ativo === 'on';
  const endereco = (req.body.endereco || '').trim() || null;

  if (!nome || !slug) {
    req.session.flash = { tipo: 'erro', texto: 'Nome e subdomínio são obrigatórios.' };
    return res.redirect('/mestre/barbearias/' + barbearia.id);
  }
  const conflito = await prisma.barbearia.findFirst({ where: { slug, NOT: { id: barbearia.id } } });
  if (conflito) {
    req.session.flash = { tipo: 'erro', texto: 'Esse subdomínio já está em uso por outra barbearia.' };
    return res.redirect('/mestre/barbearias/' + barbearia.id);
  }

  const dados = { nome, slug, ativo, endereco };

  // Só geocodifica quando o endereço muda (evita bater no Nominatim à toa e
  // preserva as coordenadas se o texto continuou igual). Endereço apagado zera
  // as coordenadas — a barbearia sai da busca "perto de você".
  let avisoGeo = '';
  if (endereco !== barbearia.endereco) {
    if (!endereco) {
      dados.latitude = null;
      dados.longitude = null;
    } else {
      const geo = await geocodificar(endereco);
      if (geo) {
        dados.latitude = geo.latitude;
        dados.longitude = geo.longitude;
      } else {
        dados.latitude = null;
        dados.longitude = null;
        avisoGeo = ' Não consegui localizar esse endereço no mapa — confira e salve de novo para aparecer na busca do app.';
      }
    }
  }

  await prisma.barbearia.update({ where: { id: barbearia.id }, data: dados });
  req.session.flash = { tipo: avisoGeo ? 'erro' : 'sucesso', texto: 'Barbearia atualizada.' + avisoGeo };
  res.redirect('/mestre/barbearias/' + barbearia.id);
}

// POST /mestre/barbearias/:id/remover — exclui a barbearia (cascata).
async function removerBarbearia(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;
  await prisma.barbearia.delete({ where: { id: barbearia.id } }).catch(() => {});
  // Se estava operando essa barbearia, encerra a impersonação.
  if (req.session.barbeariaAtivaId === barbearia.id) delete req.session.barbeariaAtivaId;
  req.session.flash = { tipo: 'sucesso', texto: 'Barbearia excluída.' };
  res.redirect('/mestre');
}

// POST /mestre/barbearias/:id/equipe — adiciona um barbeiro à barbearia.
async function criarBarbeiro(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;

  const nome = (req.body.nome || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const senha = req.body.senha || '';
  const papel = req.body.papel === 'admin' ? 'admin' : 'funcionario';

  if (!nome || !email || senha.length < 6) {
    req.session.flash = { tipo: 'erro', texto: 'Preencha nome, e-mail e senha (mínimo 6 caracteres).' };
    return res.redirect('/mestre/barbearias/' + barbearia.id);
  }
  const existe = await prisma.usuario.findUnique({
    where: { barbeariaId_email: { barbeariaId: barbearia.id, email } },
  });
  if (existe) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um usuário com esse e-mail nesta barbearia.' };
    return res.redirect('/mestre/barbearias/' + barbearia.id);
  }

  await prisma.usuario.create({
    data: { barbeariaId: barbearia.id, nome, email, senhaHash: await bcrypt.hash(senha, 10), papel },
  });
  req.session.flash = { tipo: 'sucesso', texto: `${nome} adicionado à equipe.` };
  res.redirect('/mestre/barbearias/' + barbearia.id);
}

// GET /mestre/barbearias/:id/equipe/:uid/editar — edita um barbeiro.
async function formEditarBarbeiro(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;
  const membro = await prisma.usuario.findFirst({
    where: { id: Number(req.params.uid), barbeariaId: barbearia.id },
  });
  if (!membro) return res.redirect('/mestre/barbearias/' + barbearia.id);
  res.render('mestre/barbeiro-editar', { layout: 'layouts/mestre', titulo: 'Editar ' + membro.nome, barbearia, membro });
}

// POST /mestre/barbearias/:id/equipe/:uid — atualiza nome/e-mail/senha/papel.
async function atualizarBarbeiro(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;
  const uid = Number(req.params.uid);
  const membro = await prisma.usuario.findFirst({ where: { id: uid, barbeariaId: barbearia.id } });
  if (!membro) return res.redirect('/mestre/barbearias/' + barbearia.id);

  const nome = (req.body.nome || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const papel = req.body.papel === 'admin' ? 'admin' : 'funcionario';
  const senha = req.body.senha || '';

  if (!nome || !email) {
    req.session.flash = { tipo: 'erro', texto: 'Nome e e-mail são obrigatórios.' };
    return res.redirect(`/mestre/barbearias/${barbearia.id}/equipe/${uid}/editar`);
  }
  if (senha && senha.length < 6) {
    req.session.flash = { tipo: 'erro', texto: 'A nova senha precisa de no mínimo 6 caracteres.' };
    return res.redirect(`/mestre/barbearias/${barbearia.id}/equipe/${uid}/editar`);
  }
  const conflito = await prisma.usuario.findFirst({
    where: { barbeariaId: barbearia.id, email, NOT: { id: uid } },
  });
  if (conflito) {
    req.session.flash = { tipo: 'erro', texto: 'Esse e-mail já está em uso por outro usuário desta barbearia.' };
    return res.redirect(`/mestre/barbearias/${barbearia.id}/equipe/${uid}/editar`);
  }

  const data = { nome, email, papel };
  if (senha.length >= 6) data.senhaHash = await bcrypt.hash(senha, 10);
  await prisma.usuario.update({ where: { id: uid }, data });
  req.session.flash = { tipo: 'sucesso', texto: 'Dados do barbeiro atualizados.' };
  res.redirect('/mestre/barbearias/' + barbearia.id);
}

// POST /mestre/barbearias/:id/equipe/:uid/toggle — ativa/desativa um barbeiro.
async function toggleBarbeiro(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;
  const membro = await prisma.usuario.findFirst({
    where: { id: Number(req.params.uid), barbeariaId: barbearia.id },
  });
  if (membro) await prisma.usuario.update({ where: { id: membro.id }, data: { ativo: !membro.ativo } });
  res.redirect('/mestre/barbearias/' + barbearia.id);
}

// POST /mestre/barbearias/:id/marca — salva logo (upload) + powered-by.
async function salvarMarca(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;
  const barbeariaId = barbearia.id;
  const mostrarPoweredBy = req.body.mostrar_powered_by === 'on';

  await prisma.configuracao.upsert({
    where: { barbeariaId_chave: { barbeariaId, chave: 'mostrar_powered_by' } },
    update: { valor: String(mostrarPoweredBy) },
    create: { barbeariaId, chave: 'mostrar_powered_by', valor: String(mostrarPoweredBy) },
  });

  if (req.file) {
    const atual = await prisma.configuracao.findUnique({
      where: { barbeariaId_chave: { barbeariaId, chave: 'logo_url' } },
    });
    const anterior = atual && caminhoDoUpload(atual.valor);
    if (anterior) fs.unlink(anterior, () => {});
    const novoUrl = '/uploads/' + req.file.filename;
    await prisma.configuracao.upsert({
      where: { barbeariaId_chave: { barbeariaId, chave: 'logo_url' } },
      update: { valor: novoUrl },
      create: { barbeariaId, chave: 'logo_url', valor: novoUrl },
    });
  }

  req.session.flash = { tipo: 'sucesso', texto: 'Marca atualizada.' };
  res.redirect('/mestre/barbearias/' + barbeariaId);
}

// POST /mestre/barbearias/:id/marca/remover-logo — remove o logo.
async function removerLogo(req, res) {
  const barbearia = await carregarBarbearia(req, res);
  if (!barbearia) return;
  const atual = await prisma.configuracao.findUnique({
    where: { barbeariaId_chave: { barbeariaId: barbearia.id, chave: 'logo_url' } },
  });
  if (atual && atual.valor) {
    fs.unlink(path.join(__dirname, '..', '..', atual.valor.replace(/^\//, '')), () => {});
    await prisma.configuracao.update({
      where: { barbeariaId_chave: { barbeariaId: barbearia.id, chave: 'logo_url' } },
      data: { valor: '' },
    });
  }
  req.session.flash = { tipo: 'sucesso', texto: 'Logo removido.' };
  res.redirect('/mestre/barbearias/' + barbearia.id);
}

// POST /mestre/entrar/:id — o dono passa a operar uma barbearia (impersonação).
async function entrar(req, res) {
  const id = Number(req.params.id);
  const barbearia = await prisma.barbearia.findUnique({ where: { id } });
  if (!barbearia) {
    req.session.flash = { tipo: 'erro', texto: 'Barbearia não encontrada.' };
    return res.redirect('/mestre');
  }
  req.session.barbeariaAtivaId = barbearia.id;
  res.redirect('/painel');
}

// POST /mestre/sair — encerra a operação de uma barbearia e volta ao painel-mestre.
async function sair(req, res) {
  delete req.session.barbeariaAtivaId;
  res.redirect('/mestre');
}

module.exports = {
  painel,
  formNova,
  criarBarbearia,
  detalhe,
  atualizarBarbearia,
  removerBarbearia,
  criarBarbeiro,
  formEditarBarbeiro,
  atualizarBarbeiro,
  toggleBarbeiro,
  salvarMarca,
  removerLogo,
  entrar,
  sair,
};
