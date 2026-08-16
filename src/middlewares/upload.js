// Configuração do multer para upload de fotos (serviços, produtos, equipe, perfil).
//
// SEGURANÇA — por que a validação é pela EXTENSÃO e não pelo `mimetype`:
// o `file.mimetype` é o Content-Type que o CLIENTE declara no formulário, e
// mentir nele é trivial. A versão anterior confiava nesse campo e, pior,
// salvava o arquivo com a extensão do nome original. Dava para enviar um .html
// declarando `image/png`: o filtro deixava passar e o arquivo era gravado como
// .html — servido depois pelo Express como `text/html`, na MESMA origem do
// painel. Ou seja, script rodando com a sessão de quem abrisse o link.
//
// A defesa que realmente fecha isso é a segunda: o arquivo é sempre gravado com
// uma extensão da lista abaixo. Mesmo que alguém contrabandeie HTML dentro de um
// "foto.png", o navegador recebe `image/png` e não executa nada — no pior caso
// mostra uma imagem quebrada.
//
// SVG fica FORA da lista de propósito: é XML, aceita <script> e é servido como
// `image/svg+xml`, que o navegador executa. Um "formato de imagem" que roda
// código não entra aqui.
const multer = require('multer');
const path = require('path');
const { uploadsDir: pastaUploads } = require('../config/paths');

// extensão aceita -> tipo que ela realmente é
const FORMATOS = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const MENSAGEM = 'Formato de imagem inválido (use JPG, PNG ou WEBP).';

function extensaoValida(nomeOriginal) {
  const ext = path.extname(String(nomeOriginal || '')).toLowerCase();
  return FORMATOS[ext] ? ext : null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pastaUploads),
  filename: (req, file, cb) => {
    // Só chega aqui o que passou pelo filtro, então a extensão é uma das
    // conhecidas. Ainda assim ela é relida da lista em vez de reaproveitar o
    // nome do usuário — nome de arquivo é entrada de usuário, e a única
    // extensão em que dá para confiar é a que nós mesmos escolhemos.
    const ext = extensaoValida(file.originalname) || '.png';
    cb(null, `foto-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

function filtro(req, file, cb) {
  const ext = extensaoValida(file.originalname);
  if (!ext) return cb(new Error(MENSAGEM));

  // O tipo declarado precisa combinar com a extensão. Não é a proteção
  // principal (o cliente controla os dois), mas barra o envio desajeitado e
  // deixa a intenção explícita.
  if (file.mimetype !== FORMATOS[ext]) return cb(new Error(MENSAGEM));

  cb(null, true);
}

module.exports = multer({
  storage,
  fileFilter: filtro,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
});
