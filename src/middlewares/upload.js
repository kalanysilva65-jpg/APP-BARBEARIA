// Configuração do multer para upload de fotos de produtos em /uploads.
// (Usado a partir da Fase 4 — cadastro de serviços/produtos.)
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const pastaUploads = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(pastaUploads)) {
  fs.mkdirSync(pastaUploads, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pastaUploads),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const nome = `foto-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, nome);
  },
});

// Aceita apenas imagens comuns.
function filtro(req, file, cb) {
  const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (permitidos.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Formato de imagem inválido (use JPG, PNG ou WEBP).'));
}

module.exports = multer({
  storage,
  fileFilter: filtro,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
});
