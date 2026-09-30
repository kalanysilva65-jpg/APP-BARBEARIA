// Arrastar pra baixo fecha qualquer pop-up (pedido do dono, 2026-09-30).
// Vale para todas as folhas (.sv-folha dentro de .sv-folha-fundo) e modais
// (.ag-modal-box dentro de .ag-overlay). Para fechar, "clica" no fundo do
// pop-up — cada tela já fecha nesse clique, com a própria lógica.
(function () {
  if (window.__folhaArrastar) return;
  window.__folhaArrastar = true;

  var SEL_FOLHA = '.sv-folha, .ag-modal-box';
  var SEL_FUNDO = '.sv-folha-fundo, .ag-overlay';
  var LIMITE = 110; // px arrastados para fechar
  var f = null, fundo = null, y0 = 0, x0 = 0, t0 = 0, dy = 0, arrastando = false, decidido = false;

  function rolagemNoTopo(el, alvo) {
    // Se o toque começou num bloco rolável interno que não está no topo, deixa rolar.
    for (var n = alvo; n && n !== el.parentNode; n = n.parentNode) {
      if (n.scrollTop > 0) return false;
    }
    return true;
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    var alvo = e.target;
    if (alvo.closest && alvo.closest('input, textarea, select, [contenteditable], [data-sem-arrastar]')) return;
    var folha = alvo.closest && alvo.closest(SEL_FOLHA);
    if (!folha) return;
    var fd = folha.closest(SEL_FUNDO);
    if (!fd || !rolagemNoTopo(folha, alvo)) return;
    f = folha; fundo = fd; y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = Date.now();
    dy = 0; arrastando = false; decidido = false;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!f) return;
    var ddy = e.touches[0].clientY - y0, ddx = e.touches[0].clientX - x0;
    if (!decidido) {
      if (Math.abs(ddy) < 8 && Math.abs(ddx) < 8) return;
      decidido = true;
      arrastando = ddy > 0 && Math.abs(ddy) > Math.abs(ddx);
      if (!arrastando) { f = null; return; }
      f.style.transition = 'none';
      f.style.animation = 'none';
    }
    if (!arrastando) return;
    dy = Math.max(0, ddy);
    f.style.transform = 'translateY(' + dy + 'px)';
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  function soltar() {
    if (!f) return;
    var folha = f, fd = fundo;
    f = null;
    if (!arrastando) return;
    var rapido = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6;
    folha.style.transition = 'transform .22s ease';
    if (dy > LIMITE || rapido) {
      folha.style.transform = 'translateY(100%)';
      setTimeout(function () {
        fd.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // Rede de segurança: se a tela não fechou no clique do fundo, esconde.
        if (fd.classList.contains('sv-folha-fundo') && !fd.hidden && fd.offsetParent !== null) {
          fd.hidden = true;
          document.body.classList.remove('modal-aberto');
        }
        folha.style.transition = folha.style.transform = folha.style.animation = '';
      }, 200);
    } else {
      folha.style.transform = '';
      setTimeout(function () { folha.style.transition = folha.style.animation = ''; }, 230);
    }
  }
  document.addEventListener('touchend', soltar);
  document.addEventListener('touchcancel', soltar);
})();
