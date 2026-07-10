// Caminhos de dados persistentes da aplicação.
//
// IMPORTANTE (produção): o banco, as sessões e os uploads NÃO podem ficar
// dentro da pasta do código. Em hospedagens que fazem deploy limpo (Hostinger,
// Passenger etc.), essa pasta é recriada a cada "Reimplantar" — e tudo que
// estiver lá dentro é perdido: banco, fotos, clientes, agendamentos.
//
// Aponte APP_DATA_DIR para um diretório FORA do deploy (ex.: /home/user/cortavo-data)
// e o banco/uploads/sessões passam a sobreviver aos redeploys.
const fs = require('fs');
const path = require('path');

// Raiz dos dados. Fallback: <projeto>/data (só para desenvolvimento local).
const appDataDir = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');

// Uploads (fotos de serviços, barbeiros e logos). Fallback: <projeto>/uploads
// para não quebrar instalações antigas que já têm arquivos lá.
const uploadsDir = process.env.APP_DATA_DIR
  ? path.join(appDataDir, 'uploads')
  : path.join(__dirname, '..', '..', 'uploads');

const sessionsDir = path.join(appDataDir, 'sessions');

fs.mkdirSync(appDataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

// Converte uma fotoUrl pública ("/uploads/foto-123.jpg") no caminho em disco.
// Retorna null se a url não for um upload (evita apagar arquivo fora da pasta).
function caminhoDoUpload(fotoUrl) {
  if (!fotoUrl) return null;
  const nome = path.basename(fotoUrl.replace(/^\//, ''));
  if (!nome || !fotoUrl.startsWith('/uploads/')) return null;
  return path.join(uploadsDir, nome);
}

module.exports = { appDataDir, uploadsDir, sessionsDir, caminhoDoUpload };
