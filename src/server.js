// Ponto de entrada do app: configura o Express, a sessão, as views e as rotas.
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');

const app = express();

// --- Views: EJS + layouts -------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/painel'); // layout padrão (painel interno)

// --- Parsers e utilidades -------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method')); // permite PUT/DELETE em formulários

// --- Arquivos estáticos ---------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- Sessão ---------------------------------------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'troque-este-segredo',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 horas
  })
);

// --- Tenant: resolve a barbearia do subdomínio (contexto público) ---------
const { resolverBarbearia, barbeariaIdAtual } = require('./middlewares/tenant');
app.use(resolverBarbearia);

// --- Variáveis disponíveis em todas as views ------------------------------
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash; // flash some depois de exibido
  res.locals.currentPath = req.path;
  // Formata centavos -> "R$ 40,00"
  res.locals.fmtBRL = (centavos) =>
    ((centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Formata Date -> "dd/mm/aaaa"
  res.locals.fmtData = (d) => {
    const x = new Date(d);
    return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
  };
  // Formata telefone normalizado -> "(51) 99999-9999"
  res.locals.fmtTelefone = require('./utils/telefone').formatarTelefone;

  // Logo/marca da barbearia do contexto: a do usuário logado (painel) ou a do
  // subdomínio (público). Sem contexto, usa os padrões.
  const ctxId = barbeariaIdAtual(req) || (req.barbearia && req.barbearia.id) || null;
  require('./controllers/configuracaoMarcaController').lerMarca(ctxId).then((marca) => {
    res.locals.marcaLogoUrl = marca.logoUrl;
    res.locals.marcaMostrarPoweredBy = marca.mostrarPoweredBy;
    next();
  }).catch(() => {
    res.locals.marcaLogoUrl = null;
    res.locals.marcaMostrarPoweredBy = true;
    next();
  });
});

// --- Manifesto PWA (dinâmico por barbearia) -------------------------------
// Cada subdomínio serve um manifesto com o nome/logo da sua barbearia e abre
// direto no login. O logo enviado (se houver) vira o ícone do app.
app.get('/manifest.webmanifest', (req, res) => {
  const nome = req.barbearia ? req.barbearia.nome : 'Barbearia';
  const icones = [{ src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
  if (res.locals.marcaLogoUrl) {
    icones.unshift({ src: res.locals.marcaLogoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' });
  }
  res.type('application/manifest+json').json({
    name: nome,
    short_name: nome.length > 12 ? nome.slice(0, 12) : nome,
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#111111',
    icons: icones,
  });
});

// --- Rotas ----------------------------------------------------------------
app.use('/', require('./routes/auth'));
app.use('/agendar', require('./routes/agendar')); // área pública do cliente
app.use('/painel', require('./routes/painel'));
app.use('/mestre', require('./routes/mestre')); // painel-mestre (dono do sistema)

// --- 404 ------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).render('erro', {
    layout: 'layouts/blank',
    titulo: 'Página não encontrada',
    mensagem: 'A página que você procura não existe.',
  });
});

// --- Tratamento de erros --------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('erro', {
    layout: 'layouts/blank',
    titulo: 'Erro',
    mensagem: 'Ocorreu um erro inesperado.',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Barbearia rodando em http://localhost:${PORT}`);
});
