/* =========================================================================
   Motor de animação do design "suave" (pedido do dono, 2026-08-01)
   -------------------------------------------------------------------------
   Porta o runtime do HTML de referência, que não é CSS puro: lá as animações
   são disparadas por atributos `data-*` quando o elemento ENTRA NA TELA, com
   escalonamento por índice. Sem isto o app tem as formas certas mas fica
   estático — foi o que o dono apontou.

   O que cada atributo faz:
     data-count       número conta de 0 até o valor (preserva "R$", "%", "/mês")
     data-fill        barra cresce de 0% até a largura final
     data-reveal      entra subindo (revealUp)
     data-anim="X"    entra com a animação X (agendaIn, svcIn, prodIn...)
     data-mos-reveal  revela por clip-path (mosWipe); barra interna cresce
     data-bar-reveal  coluna de gráfico cresce de baixo (barRise)

   Regras que vêm da referência e são fáceis de perder:
   · o escalonamento satura (Math.min(idx, N)) — sem teto, o 30º item da lista
     entraria meio segundo depois e pareceria travado;
   · cada elemento só anima UMA vez (marcador `-on`), senão rolar pra cima e
     pra baixo re-dispara tudo;
   · respeita `prefers-reduced-motion`: quem pediu menos movimento recebe o
     valor final direto, sem animação nenhuma.
   ========================================================================= */
(function () {
  'use strict';

  var reduzido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Viewport do ANCESTRAL que rola, não o da janela: as telas rolam dentro de
  // `.sv-tela`/`.sv-rolagem`, então usar innerHeight erraria o momento.
  function viewport(el) {
    var p = el.parentElement;
    while (p) {
      var cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) {
        var r = p.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }
      p = p.parentElement;
    }
    return { top: 0, bottom: window.innerHeight };
  }

  function visivel(el) {
    var r = el.getBoundingClientRect();
    if (!r.height) return false;
    var vp = viewport(el);
    return r.top < vp.bottom - 8 && r.bottom > vp.top + 8;
  }

  var suave = 'cubic-bezier(.2,.9,.25,1.05)';

  function contar(el) {
    var final = el.getAttribute('data-final') || el.textContent;
    el.setAttribute('data-final', final);
    var digitos = final.replace(/\D/g, '');
    if (!digitos) return;
    var alvo = parseInt(digitos, 10);
    if (!alvo) return;
    if (reduzido) return;
    // Reescreve só o primeiro grupo numérico: "R$1.234" e "45%" mantêm o
    // prefixo/sufixo, que é o que dá sentido ao número.
    var t0 = performance.now();
    var dur = 620;
    function passo(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      var n = Math.round(alvo * e);
      el.textContent = final.replace(/[\d.,]+/, n.toLocaleString('pt-BR'));
      if (p < 1) requestAnimationFrame(passo);
      else el.textContent = final;
    }
    requestAnimationFrame(passo);
  }

  var DUR_ANIM = {
    pagIn: 0.4, agendaIn: 0.44, ledgerIn: 0.42, svcIn: 0.5,
    teamIn: 0.45, planIn: 0.55, prodIn: 0.5, stockIn: 0.42,
  };

  function varrer() {
    document.querySelectorAll('[data-count]:not([data-count-on])').forEach(function (el) {
      if (!visivel(el)) return;
      el.setAttribute('data-count-on', '1');
      contar(el);
    });

    document.querySelectorAll('[data-fill]:not([data-fill-on])').forEach(function (el, i) {
      if (!visivel(el)) return;
      el.setAttribute('data-fill-on', '1');
      var larguraFinal = el.style.width || '100%';
      if (reduzido) return;
      el.style.width = '0%';
      el.style.transition = 'width 0.68s cubic-bezier(.2,.9,.25,1.02) ' + (Math.min(i, 6) * 0.07) + 's';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.style.width = larguraFinal; });
      });
    });

    document.querySelectorAll('[data-reveal]:not([data-reveal-on])').forEach(function (el, i) {
      if (!visivel(el)) return;
      el.setAttribute('data-reveal-on', '1');
      if (reduzido) return;
      el.style.animation = 'svRevealUp 0.5s ' + suave + ' ' + (Math.min(i, 8) * 0.06) + 's backwards';
    });

    document.querySelectorAll('[data-anim]:not([data-anim-on])').forEach(function (el, i) {
      if (!visivel(el)) return;
      el.setAttribute('data-anim-on', '1');
      if (reduzido) return;
      var nome = el.getAttribute('data-anim');
      var dur = DUR_ANIM[nome] || 0.45;
      el.style.animation = nome + ' ' + dur + 's ' + suave + ' ' + (Math.min(i, 8) * 0.055) + 's backwards';
    });

    document.querySelectorAll('[data-mos-reveal]:not([data-mos-on])').forEach(function (el, i) {
      if (!visivel(el)) return;
      el.setAttribute('data-mos-on', '1');
      if (reduzido) return;
      el.style.animation = 'mosWipe 0.55s cubic-bezier(.22,.85,.2,1) ' + ((i % 4) * 0.07) + 's backwards';
      var barra = el.querySelector('[data-mos-bar]');
      if (barra) {
        barra.style.transformOrigin = 'left center';
        barra.style.animation = 'mosGrow 0.62s cubic-bezier(.2,.9,.25,1.08) ' + ((i % 4) * 0.07 + 0.12) + 's backwards';
      }
    });

    document.querySelectorAll('[data-bar-reveal]:not([data-bar-on])').forEach(function (el, i) {
      if (!visivel(el)) return;
      el.setAttribute('data-bar-on', '1');
      if (reduzido) return;
      el.style.transformOrigin = 'bottom center';
      el.style.animation = 'barRise 0.6s cubic-bezier(.2,.9,.25,1.05) ' + (Math.min(i, 8) * 0.05) + 's backwards';
    });
  }

  var pendente = false;
  function agendar() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(function () { pendente = false; varrer(); });
  }

  function ligar() {
    varrer();
    // `capture` porque quem rola é um container interno, e evento de scroll
    // não borbulha — sem isso a varredura só rodaria no scroll da janela.
    document.addEventListener('scroll', agendar, { passive: true, capture: true });
    window.addEventListener('resize', agendar, { passive: true });
    // Conteúdo que aparece depois (folha inferior abrindo, aba trocando).
    if (window.MutationObserver) {
      new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar);
  else ligar();
})();
