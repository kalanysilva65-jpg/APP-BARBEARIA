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

const raizProjeto = path.join(__dirname, '..', '..');

// Estamos em produção? APP_DOMAIN só é definido no servidor.
const ehProducao = process.env.NODE_ENV === 'production' || !!process.env.APP_DOMAIN;

// Em produção, um APP_DATA_DIR ausente ou relativo faria os dados caírem dentro
// da pasta de deploy — que é apagada no próximo "Reimplantar". Falhar aqui, alto
// e cedo, é muito melhor do que descobrir a perda depois que os dados sumiram.
function exigirConfigDeProducao() {
  const dir = process.env.APP_DATA_DIR;
  const url = process.env.DATABASE_URL || '';

  if (!dir || !path.isAbsolute(dir)) {
    throw new Error(
      'APP_DATA_DIR ausente ou não-absoluto (valor: ' + (dir || '<vazio>') + ').\n' +
        'Em produção os dados precisam morar FORA da pasta de deploy, senão são\n' +
        'apagados a cada "Reimplantar". Defina, com o caminho absoluto real:\n' +
        '  APP_DATA_DIR=/home/SEU_USUARIO/cortavo-data\n' +
        '  DATABASE_URL="file:/home/SEU_USUARIO/cortavo-data/app.db"'
    );
  }
  if (path.resolve(dir).startsWith(path.resolve(raizProjeto) + path.sep)) {
    throw new Error(
      'APP_DATA_DIR (' + dir + ') está dentro da pasta do código.\n' +
        'Esse diretório é recriado a cada deploy — os dados seriam perdidos.\n' +
        'Use um caminho fora dele, ex.: /home/SEU_USUARIO/cortavo-data'
    );
  }
  if (url.startsWith('file:') && !path.isAbsolute(url.slice('file:'.length).split('?')[0])) {
    throw new Error(
      'DATABASE_URL precisa ser um caminho ABSOLUTO em produção (valor: ' + url + ').\n' +
        'O `prisma migrate deploy` resolve caminhos relativos a partir de prisma/,\n' +
        'e o banco acabaria dentro da pasta de deploy. Use:\n' +
        '  DATABASE_URL="file:' + path.posix.join(dir.replace(/\\/g, '/'), 'app.db') + '"'
    );
  }
}

if (ehProducao) exigirConfigDeProducao();

// Raiz dos dados. Fallback: <projeto>/data (só para desenvolvimento local).
const appDataDir = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(raizProjeto, 'data');

// Uploads (fotos de serviços, barbeiros e logos). Fallback: <projeto>/uploads
// para não quebrar instalações antigas que já têm arquivos lá.
const uploadsDir = process.env.APP_DATA_DIR
  ? path.join(appDataDir, 'uploads')
  : path.join(raizProjeto, 'uploads');

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
