// Freio a força-bruta nas telas de login (equipe e cliente).
// O server usa `trust proxy = 1`, então o rate-limit enxerga o IP real do
// cliente atrás do nginx — sem isso, todo mundo apareceria com o IP do proxy e
// um cadeado só derrubaria o site inteiro.
const rateLimit = require('express-rate-limit');

// Janela de 15 min. O teto é generoso de propósito: numa barbearia várias
// pessoas saem pelo MESMO IP (o wifi da casa), então um teto baixo travaria
// quem só errou a senha. 20 tentativas seguram um humano distraído e ainda
// assim fecham a porta pra milhares de tentativas automatizadas.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // As telas de login são formulários (POST): responder o 429 cru do pacote
  // apareceria como página quebrada. Em vez disso, volta pro formulário com um
  // aviso amigável, no mesmo padrão de erro do resto do app.
  handler(req, res) {
    req.session.flash = {
      tipo: 'erro',
      texto: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    };
    res.redirect(req.get('Referer') || '/login');
  },
});

// Freio das rotas do painel-mestre (super-admin do SaaS). É a área mais sensível
// do sistema, usada por UMA pessoa (o dono) — então o teto pode ser bem mais
// baixo que o de tráfego público. Aqui o alvo não é força-bruta de login (isso
// o `limiteLogin` já cobre no /login), e sim conter uma sessão sequestrada que
// tente disparar muitas ações em rajada. 300 req / 10 min é folgado pra um
// humano navegando e fecha a porta pra automação.
const limiteAdmin = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).render('erro', {
      layout: 'layouts/blank',
      titulo: 'Muitas requisições',
      mensagem: 'Você fez muitas ações em pouco tempo. Aguarde um minuto e tente de novo.',
    });
  },
});

module.exports = { limiteLogin, limiteAdmin };
