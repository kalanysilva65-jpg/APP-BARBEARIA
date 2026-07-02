// Resolução do tenant (barbearia) por subdomínio, com escopo por barbearia.
//
// Em produção a barbearia vem do subdomínio: <slug>.seuapp.com.
// Em desenvolvimento (localhost, sem subdomínio) usa-se ?b=<slug>, que fica
// guardado na sessão para persistir entre as páginas.
//
// Regras de contexto:
//  - Área pública (/agendar): a barbearia vem do subdomínio (req.barbearia).
//  - Painel (/painel): a barbearia vem do usuário logado (staff) ou da barbearia
//    que o dono escolheu "entrar" (impersonação) — NUNCA do subdomínio, por segurança.
const prisma = require('../config/db');

// Subdomínios que NÃO representam uma barbearia.
const SUBDOMINIOS_RESERVADOS = new Set(['www', 'admin', 'painel', 'app', 'api', 'mestre']);

// Extrai o slug da barbearia a partir do hostname.
// Ex.: "barbearia1.seuapp.com" -> "barbearia1"; "barbearia1.localhost" -> "barbearia1".
// localhost puro / IP não têm subdomínio utilizável -> null.
function extrairSlug(req) {
  const host = (req.hostname || '').toLowerCase();
  const partes = host.split('.');
  const ehLocalhost = partes[partes.length - 1] === 'localhost';
  const minPartes = ehLocalhost ? 2 : 3; // sub.localhost (2) ou sub.dominio.tld (3)
  if (partes.length >= minPartes && !SUBDOMINIOS_RESERVADOS.has(partes[0])) {
    return partes[0];
  }
  return null;
}

// Middleware: resolve a barbearia do contexto PÚBLICO (subdomínio ou ?b= em dev).
async function resolverBarbearia(req, res, next) {
  // Dev: ?b=slug fixa a barbearia na sessão (facilita testar sem subdomínio real).
  // ?b=mestre limpa o contexto (permite logar como dono do sistema em dev).
  if (req.query.b !== undefined) {
    const val = String(req.query.b).toLowerCase();
    if (!val || SUBDOMINIOS_RESERVADOS.has(val)) delete req.session.devBarbeariaSlug;
    else req.session.devBarbeariaSlug = val;
  }

  let slug = extrairSlug(req);
  if (!slug && req.session.devBarbeariaSlug) slug = req.session.devBarbeariaSlug;

  // slug informado (subdomínio ou dev) — mesmo que aponte para barbearia inexistente/inativa.
  req.slugBarbearia = slug || null;
  req.barbearia = null;
  if (slug) {
    const b = await prisma.barbearia.findUnique({ where: { slug } });
    if (b && b.ativo) req.barbearia = b;
  }
  res.locals.barbearia = req.barbearia;
  next();
}

// Retorna o id da barbearia "ativa" para o painel:
//  - staff (admin/funcionario): a própria barbearia;
//  - dono: a barbearia que ele escolheu operar (impersonação), se houver.
function barbeariaIdAtual(req) {
  const u = req.session.usuario;
  if (!u) return null;
  if (u.papel === 'dono') return req.session.barbeariaAtivaId || null;
  return u.barbeariaId || null;
}

// Middleware do painel: garante que há uma barbearia no contexto e a deixa em req.barbeariaId.
// Dono sem barbearia escolhida é mandado para o painel-mestre.
async function exigeBarbeariaPainel(req, res, next) {
  const id = barbeariaIdAtual(req);
  if (!id) {
    if (req.session.usuario && req.session.usuario.papel === 'dono') {
      return res.redirect('/mestre');
    }
    return res.status(400).render('erro', {
      layout: 'layouts/blank',
      titulo: 'Barbearia não encontrada',
      mensagem: 'Sua conta não está vinculada a nenhuma barbearia.',
    });
  }
  req.barbeariaId = id;
  next();
}

// Middleware público: exige que o subdomínio aponte para uma barbearia válida.
function exigeBarbeariaPublica(req, res, next) {
  if (!req.barbearia) {
    return res.status(404).render('erro', {
      layout: 'layouts/blank',
      titulo: 'Barbearia não encontrada',
      mensagem: 'Este endereço não corresponde a nenhuma barbearia ativa.',
    });
  }
  req.barbeariaId = req.barbearia.id;
  next();
}

module.exports = {
  resolverBarbearia,
  barbeariaIdAtual,
  exigeBarbeariaPainel,
  exigeBarbeariaPublica,
  extrairSlug,
};
