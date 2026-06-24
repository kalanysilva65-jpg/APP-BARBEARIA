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

// --- Variáveis disponíveis em todas as views ------------------------------
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash; // flash some depois de exibido
  res.locals.currentPath = req.path;
  // Formata centavos -> "R$ 40,00"
  res.locals.fmtBRL = (centavos) =>
    ((centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  next();
});

// --- Rotas ----------------------------------------------------------------
app.use('/', require('./routes/auth'));
app.use('/painel', require('./routes/painel'));

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
