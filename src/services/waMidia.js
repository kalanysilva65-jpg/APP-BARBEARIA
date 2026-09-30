// Mídias das conversas de WhatsApp (fotos, áudios, documentos...). Ficam em
// <APP_DATA_DIR>/wa-midia — FORA de /uploads, que é público: são dados de
// clientes, então só saem por uma rota logada e escopada por barbearia
// (GET /painel/conversas/midia/:mensagemId).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { appDataDir } = require('../config/paths');

const DIR = path.join(appDataDir, 'wa-midia');
fs.mkdirSync(DIR, { recursive: true });

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/webm': 'webm',
  'application/pdf': 'pdf',
};

function extDe(mime, nomeOriginal) {
  const base = String(mime || '').split(';')[0].trim().toLowerCase();
  if (EXT[base]) return EXT[base];
  const e = path.extname(nomeOriginal || '').replace('.', '').toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(e) ? e : 'bin';
}

// Grava e devolve o NOME do arquivo (é o que vai no banco).
function salvar(buffer, mime, nomeOriginal) {
  const nome = crypto.randomBytes(16).toString('hex') + '.' + extDe(mime, nomeOriginal);
  fs.writeFileSync(path.join(DIR, nome), buffer);
  return nome;
}

// Caminho em disco de um nome gravado (só nomes gerados por nós).
function caminho(nome) {
  if (!nome || !/^[a-f0-9]{32}\.[a-z0-9]{1,5}$/.test(nome)) return null;
  return path.join(DIR, nome);
}

// Tipo da mensagem (nosso) a partir do mime — para o que o barbeiro ENVIA.
function tipoDoMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'imagem';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'documento';
}

// Nosso tipo -> tipo da Cloud API.
const TIPO_API = { imagem: 'image', video: 'video', audio: 'audio', documento: 'document', figurinha: 'sticker' };

module.exports = { salvar, caminho, tipoDoMime, TIPO_API };
