// Foto do celular -> menor e em JPEG, ANTES de enviar (pedido do dono, 2026-10-05:
// "ele não está subindo as fotos").
//
// Por quê: foto de celular costuma ter 3–8 MB (e às vezes é HEIC), e o servidor
// só aceita JPG/PNG/WEBP de até 4 MB — o envio falhava. Aqui a imagem é reduzida
// (lado maior 1600px) e vira JPEG, ficando em poucas centenas de KB, que é mais do
// que suficiente para foto de barbeiro, serviço ou produto.
//
// Vale para todo <input type="file" accept="image/*"> (só esse accept exato; o
// chat de WhatsApp usa outro accept e não é afetado). Fotos pequenas e já em
// JPG/PNG/WEBP passam direto, sem mexer.
(function () {
  var MAX_LADO = 1600;
  var QUALIDADE = 0.85;
  var LIMITE_DIRETO = 1.2 * 1024 * 1024; // abaixo disso e em formato aceito: não comprime
  var OK = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };

  function carregar(arquivo) {
    // createImageBitmap respeita a orientação EXIF (foto de celular "em pé").
    if (window.createImageBitmap) {
      return createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(function () { return viaImg(arquivo); });
    }
    return viaImg(arquivo);
  }
  function viaImg(arquivo) {
    return new Promise(function (ok, erro) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); erro(new Error('decode')); };
      img.src = url;
    });
  }

  function comprimir(arquivo) {
    return carregar(arquivo).then(function (img) {
      var w = img.width, h = img.height;
      var esc = Math.min(1, MAX_LADO / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * esc)), ch = Math.max(1, Math.round(h * esc));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; // PNG com transparência vira fundo branco no JPEG
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      if (img.close) img.close();
      return new Promise(function (ok, erro) {
        c.toBlob(function (blob) { blob ? ok(blob) : erro(new Error('toBlob')); }, 'image/jpeg', QUALIDADE);
      });
    });
  }

  document.addEventListener('change', function (e) {
    var input = e.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'file' || input.getAttribute('accept') !== 'image/*') return;
    if (input.dataset.fotoOk === '1') { input.dataset.fotoOk = ''; return; } // reenvio já tratado
    var arq = input.files && input.files[0];
    if (!arq) return;
    if (OK[arq.type] && arq.size <= LIMITE_DIRETO) return; // já está bom

    // Segura os handlers originais (ex.: onchange="this.form.submit()") até a
    // foto estar pronta; depois reabre o mesmo evento.
    e.stopImmediatePropagation();
    var rotuloOriginal = arq.name.replace(/\.[^.]+$/, '') || 'foto';
    comprimir(arq).then(function (blob) {
      var novo = new File([blob], rotuloOriginal + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      var dt = new DataTransfer();
      dt.items.add(novo);
      input.files = dt.files;
      input.dataset.fotoOk = '1';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(function () {
      input.value = '';
      alert('Não consegui ler esta foto. Tente outra em JPG ou PNG (no iPhone: Ajustes > Câmera > Formatos > "Mais compatível").');
    });
  }, true);
})();
