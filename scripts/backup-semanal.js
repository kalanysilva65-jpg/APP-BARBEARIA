// BACKUP SEMANAL VERIFICADO (pedido do dono, 2026-09-30: "toda semana, sem
// erro, 100% correto").
//
// O que faz, nesta ordem — e só declara SUCESSO se TODAS as etapas passarem:
//  1. Cópia CONSISTENTE do banco inteiro (VACUUM INTO — segura com o app rodando).
//  2. Confere a cópia: `PRAGMA integrity_check` = ok e a contagem de linhas de
//     CADA tabela igual à do banco ao vivo (até 3 tentativas, caso alguém esteja
//     usando o app no meio da cópia).
//  3. Exporta em JSON os dados de CADA barbearia separadamente (restaurar uma
//     barbearia sem mexer nas outras) e confere as contagens do JSON.
//  4. Empacota banco + JSONs + fotos (uploads) + mídias do WhatsApp num .tar.gz
//     e calcula o SHA-256.
//  5. Envia para o Supabase Storage (bucket privado), BAIXA DE VOLTA e compara o
//     SHA-256 — prova que o que está lá fora é idêntico ao daqui.
//  6. Mantém as últimas N semanas lá fora e N localmente; apaga as mais velhas.
//  7. Registra o resultado em <APP_DATA_DIR>/backups/historico.json (o
//     painel-mestre mostra) e, se FALHAR, manda push para o dono.
//
// USO (no VPS, dentro de /home/cortavo/app):
//   sudo -u cortavo node scripts/backup-semanal.js              # faz o backup
//   sudo -u cortavo node scripts/backup-semanal.js --testar     # restauração de teste do último
// Cron (domingo 03:00):
//   0 3 * * 0 cd /home/cortavo/app && node scripts/backup-semanal.js >> /home/cortavo/cortavo-data/backups/backup.log 2>&1
//
// .env: SUPABASE_URL, SUPABASE_SERVICE_KEY, (opcional) SUPABASE_BUCKET=cortavo-backups,
//       BACKUP_MANTER_SEMANAS=8
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const prisma = require('../src/config/db');
const { appDataDir, uploadsDir } = require('../src/config/paths');

const DIR_BACKUPS = path.join(appDataDir, 'backups');
const HISTORICO = path.join(DIR_BACKUPS, 'historico.json');
const BUCKET = process.env.SUPABASE_BUCKET || 'cortavo-backups';
const MANTER = Math.max(2, parseInt(process.env.BACKUP_MANTER_SEMANAS, 10) || 8);
const PARTE_MAX = 45 * 1024 * 1024; // Supabase (plano free) limita 50 MB por arquivo: fatia abaixo disso

fs.mkdirSync(DIR_BACKUPS, { recursive: true });

// ---------------------------------------------------------------- SQLite (cópia)
// Lê a CÓPIA com o sqlite embutido do Node (22.5+) ou, na falta, o CLI sqlite3.
function abrirCopia(arquivo) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(arquivo, { readOnly: true });
    return { tudo: (sql, ...p) => db.prepare(sql).all(...p), fechar: () => db.close() };
  } catch (_) {
    return {
      tudo: (sql, ...p) => {
        let q = sql;
        p.forEach((v) => { q = q.replace('?', typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"); });
        const out = execFileSync('sqlite3', ['-json', '-readonly', arquivo, q], { maxBuffer: 1024 * 1024 * 1024 }).toString();
        return out.trim() ? JSON.parse(out) : [];
      },
      fechar: () => {},
    };
  }
}

async function tabelasAoVivo() {
  const t = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name");
  return t.map((r) => r.name);
}

async function contagensAoVivo(tabelas) {
  const c = {};
  for (const t of tabelas) {
    const r = await prisma.$queryRawUnsafe('SELECT count(*) AS n FROM "' + t + '"');
    c[t] = Number(r[0].n);
  }
  return c;
}

function contagensDaCopia(db, tabelas) {
  const c = {};
  for (const t of tabelas) c[t] = Number(db.tudo('SELECT count(*) AS n FROM "' + t + '"')[0].n);
  return c;
}

function diferencas(a, b) {
  return Object.keys(a).filter((t) => a[t] !== b[t]).map((t) => t + ': ao vivo ' + a[t] + ' / cópia ' + b[t]);
}

// ------------------------------------------------ export por barbearia (JSON)
// Tabelas-filhas sem barbearia_id, ligadas pelo pai.
const FILHAS = {
  agendamento_itens: ['agendamento_id', 'agendamentos'],
  agendamento_pagamentos: ['agendamento_id', 'agendamentos'],
  mensagens: ['conversa_id', 'conversas'],
  horarios_trabalho: ['usuario_id', 'usuarios'],
  dispositivos_push: ['usuario_id', 'usuarios'],
};
// Dados de acesso não vão no JSON por barbearia (ficam só no banco completo).
const OMITIR_COLUNAS = { usuarios: ['senha_hash'], dispositivos_push: ['endpoint', 'p256dh', 'auth', 'token'] };

function colunas(db, tabela) {
  return db.tudo('PRAGMA table_info("' + tabela + '")').map((c) => c.name);
}

function exportarBarbearia(db, tabelas, barbeariaId) {
  const dados = {};
  const idsPorTabela = {};
  const ordem = tabelas.slice().sort((a, b) => (FILHAS[a] ? 1 : 0) - (FILHAS[b] ? 1 : 0)); // pais antes
  for (const t of ordem) {
    const cols = colunas(db, t);
    let linhas = null;
    if (t === 'barbearias') linhas = db.tudo('SELECT * FROM barbearias WHERE id = ?', barbeariaId);
    else if (cols.includes('barbearia_id')) linhas = db.tudo('SELECT * FROM "' + t + '" WHERE barbearia_id = ?', barbeariaId);
    else if (FILHAS[t] && idsPorTabela[FILHAS[t][1]]) {
      const ids = idsPorTabela[FILHAS[t][1]];
      linhas = ids.length ? db.tudo('SELECT * FROM "' + t + '" WHERE "' + FILHAS[t][0] + '" IN (' + ids.join(',') + ')') : [];
    }
    if (!linhas) continue; // tabela global (ex.: contas_cliente) — só no banco completo
    if (cols.includes('id')) idsPorTabela[t] = linhas.map((l) => Number(l.id)).filter(Number.isFinite);
    const omitir = OMITIR_COLUNAS[t] || [];
    dados[t] = linhas.map((l) => {
      const o = {};
      for (const k of Object.keys(l)) if (!omitir.includes(k)) o[k] = typeof l[k] === 'bigint' ? Number(l[k]) : l[k];
      return o;
    });
  }
  return dados;
}

// ------------------------------------------------------------ utilidades
function sha256Arquivo(arq) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(arq, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';

function lerHistorico() {
  try { return JSON.parse(fs.readFileSync(HISTORICO, 'utf8')); } catch (_) { return []; }
}
function gravarHistorico(reg) {
  const h = lerHistorico();
  h.unshift(reg);
  fs.writeFileSync(HISTORICO, JSON.stringify(h.slice(0, 60), null, 2));
}

// ------------------------------------------------------ Supabase Storage (REST)
function supa() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const chave = process.env.SUPABASE_SERVICE_KEY || '';
  if (!url || !chave) return null;
  const h = { Authorization: 'Bearer ' + chave, apikey: chave };
  return {
    async enviar(caminho, buf) {
      const r = await fetch(url + '/storage/v1/object/' + BUCKET + '/' + caminho, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }, body: buf,
      });
      if (!r.ok) throw new Error('upload ' + caminho + ' falhou: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    },
    async baixar(caminho) {
      const r = await fetch(url + '/storage/v1/object/authenticated/' + BUCKET + '/' + caminho, { headers: h });
      if (!r.ok) throw new Error('download ' + caminho + ' falhou: ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    },
    async listar(prefixo) {
      const r = await fetch(url + '/storage/v1/object/list/' + BUCKET, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: prefixo || '', limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
      });
      if (!r.ok) throw new Error('listar falhou: ' + r.status + ' ' + (await r.text()).slice(0, 200));
      return r.json();
    },
    async apagar(caminhos) {
      if (!caminhos.length) return;
      const r = await fetch(url + '/storage/v1/object/' + BUCKET, {
        method: 'DELETE', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: caminhos }),
      });
      if (!r.ok) throw new Error('apagar falhou: ' + r.status);
    },
  };
}

// Envia o pacote em partes (<45 MB), baixa cada uma de volta e confere o hash.
async function enviarVerificado(s, pasta, arq, manifesto) {
  const tam = fs.statSync(arq).size;
  const fd = fs.openSync(arq, 'r');
  const partes = [];
  for (let off = 0, i = 1; off < tam; off += PARTE_MAX, i++) {
    const len = Math.min(PARTE_MAX, tam - off);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, off);
    const nome = path.basename(arq) + '.parte' + String(i).padStart(3, '0');
    const h = sha256(buf);
    let ok = false, erro = null;
    for (let tent = 1; tent <= 3 && !ok; tent++) {
      try {
        await s.enviar(pasta + '/' + nome, buf);
        const volta = await s.baixar(pasta + '/' + nome);
        if (sha256(volta) !== h) throw new Error('hash não bate após o download');
        ok = true;
      } catch (e) { erro = e; await new Promise((r) => setTimeout(r, 3000 * tent)); }
    }
    if (!ok) { fs.closeSync(fd); throw new Error('parte ' + nome + ': ' + erro.message); }
    partes.push({ nome, bytes: len, sha256: h });
  }
  fs.closeSync(fd);
  manifesto.partes = partes;
  const man = Buffer.from(JSON.stringify(manifesto, null, 2));
  await s.enviar(pasta + '/manifesto.json', man);
  if (sha256(await s.baixar(pasta + '/manifesto.json')) !== sha256(man)) throw new Error('manifesto não confere após o download');
}

async function avisarFalha(texto) {
  try {
    const notif = require('../src/services/notificacoes');
    const donos = await prisma.usuario.findMany({ where: { papel: 'dono', barbeariaId: null }, select: { id: true } });
    for (const d of donos) await notif.enviarParaUsuario(d.id, { titulo: '⚠️ Backup semanal FALHOU', corpo: texto.slice(0, 180), url: '/mestre', tag: 'backup' });
  } catch (_) { /* aviso é best-effort; o histórico já registra */ }
}

// ------------------------------------------------------------------ backup
async function backup() {
  const inicio = new Date();
  const carimbo = inicio.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const trabalho = path.join(DIR_BACKUPS, 'tmp-' + carimbo);
  fs.mkdirSync(trabalho, { recursive: true });
  const reg = { quando: inicio.toISOString(), ok: false, etapas: [] };
  const etapa = (t) => { reg.etapas.push(t); console.log('  ✓ ' + t); };

  try {
    console.log('[backup] início ' + inicio.toISOString());
    const tabelas = await tabelasAoVivo();

    // 1+2. Cópia consistente conferida contra o banco ao vivo.
    const copia = path.join(trabalho, 'app.db');
    let conferido = false, ultimaDif = [];
    let contagens = null;
    for (let tent = 1; tent <= 3 && !conferido; tent++) {
      if (fs.existsSync(copia)) fs.unlinkSync(copia);
      await prisma.$executeRawUnsafe("VACUUM INTO '" + copia.replace(/'/g, "''") + "'");
      const vivo = await contagensAoVivo(tabelas);
      const db = abrirCopia(copia);
      const integ = db.tudo('PRAGMA integrity_check');
      const integOk = integ.length === 1 && String(Object.values(integ[0])[0]) === 'ok';
      const daCopia = contagensDaCopia(db, tabelas);
      db.fechar();
      if (!integOk) throw new Error('integrity_check da cópia falhou: ' + JSON.stringify(integ).slice(0, 300));
      ultimaDif = diferencas(vivo, daCopia);
      if (!ultimaDif.length) { conferido = true; contagens = daCopia; }
      else { console.log('  … contagens mudaram durante a cópia (tentativa ' + tent + '): ' + ultimaDif.join('; ')); await new Promise((r) => setTimeout(r, 20000)); }
    }
    if (!conferido) throw new Error('contagens não bateram após 3 tentativas: ' + ultimaDif.join('; '));
    reg.contagens = contagens;
    etapa('banco copiado, integridade OK, ' + tabelas.length + ' tabelas conferidas linha a linha (contagem)');

    // 3. Um JSON por barbearia, conferido.
    const db = abrirCopia(copia);
    const barbearias = db.tudo('SELECT id, slug, nome FROM barbearias ORDER BY id');
    reg.barbearias = [];
    for (const b of barbearias) {
      const dados = exportarBarbearia(db, tabelas, Number(b.id));
      const arqJson = path.join(trabalho, 'barbearia-' + b.id + '-' + b.slug + '.json');
      fs.writeFileSync(arqJson, JSON.stringify({ exportadoEm: inicio.toISOString(), barbearia: { id: Number(b.id), slug: b.slug, nome: b.nome }, dados }));
      const relido = JSON.parse(fs.readFileSync(arqJson, 'utf8')).dados;
      const resumo = {};
      for (const t of Object.keys(dados)) {
        if (relido[t].length !== dados[t].length) throw new Error('JSON da barbearia ' + b.slug + ' incompleto em ' + t);
        resumo[t] = dados[t].length;
      }
      reg.barbearias.push({ id: Number(b.id), slug: b.slug, nome: b.nome, linhas: resumo });
    }
    db.fechar();
    etapa(barbearias.length + ' barbearia(s) exportada(s) em JSON e conferida(s)');

    // 4. Pacote + hash (banco, JSONs, fotos, mídias do WhatsApp).
    const pacote = path.join(DIR_BACKUPS, 'cortavo-' + carimbo + '.tar.gz');
    // --force-local: no Windows (teste local) o tar GNU leria 'C:' como host remoto.
    const local = process.platform === 'win32' ? ['--force-local'] : [];
    const args = [...local, '-czf', pacote, '-C', trabalho, '.'];
    if (fs.existsSync(uploadsDir)) args.push('-C', path.dirname(uploadsDir), path.basename(uploadsDir));
    if (fs.existsSync(path.join(appDataDir, 'wa-midia'))) args.push('-C', appDataDir, 'wa-midia');
    execFileSync('tar', args);
    execFileSync('tar', [...local, '-tzf', pacote], { maxBuffer: 256 * 1024 * 1024 }); // lê o pacote inteiro: falha se corrompido
    reg.arquivo = path.basename(pacote);
    reg.bytes = fs.statSync(pacote).size;
    reg.sha256 = sha256Arquivo(pacote);
    etapa('pacote ' + reg.arquivo + ' (' + mb(reg.bytes) + ') legível, sha256 ' + reg.sha256.slice(0, 12) + '…');

    // 5. Fora do servidor, com prova de integridade.
    const s = supa();
    if (!s) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY não configurados no .env — backup ficou SÓ no disco do VPS');
    const pasta = 'semanal/' + carimbo;
    await enviarVerificado(s, pasta, pacote, { arquivo: reg.arquivo, bytes: reg.bytes, sha256: reg.sha256, criadoEm: reg.quando, contagens: reg.contagens, barbearias: reg.barbearias });
    reg.remoto = BUCKET + '/' + pasta;
    etapa('enviado ao Supabase (' + reg.remoto + ') e conferido baixando de volta');

    // 6. Retenção (remoto e local).
    const pastas = (await s.listar('semanal/')).map((o) => o.name).filter((n) => /^\d{4}-/.test(n)).sort();
    for (const velha of pastas.slice(0, Math.max(0, pastas.length - MANTER))) {
      const itens = await s.listar('semanal/' + velha + '/');
      await s.apagar(itens.map((i) => 'semanal/' + velha + '/' + i.name));
    }
    const locais = fs.readdirSync(DIR_BACKUPS).filter((n) => /^cortavo-.*\.tar\.gz$/.test(n)).sort();
    locais.slice(0, Math.max(0, locais.length - MANTER)).forEach((n) => fs.unlinkSync(path.join(DIR_BACKUPS, n)));
    etapa('retenção: mantidas as últimas ' + MANTER + ' semanas');

    reg.ok = true;
  } catch (e) {
    reg.erro = e.message;
    console.error('[backup] FALHOU: ' + e.message);
    await avisarFalha(e.message);
  } finally {
    fs.rmSync(trabalho, { recursive: true, force: true });
    reg.duracaoSeg = Math.round((Date.now() - inicio.getTime()) / 1000);
    gravarHistorico(reg);
    console.log('[backup] ' + (reg.ok ? 'CONCLUÍDO COM SUCESSO' : 'FALHOU') + ' em ' + reg.duracaoSeg + 's');
  }
  return reg;
}

// ------------------------------------------- restauração de teste (--testar)
// Baixa o último backup do Supabase, confere hashes, extrai numa pasta à parte
// e confere integridade + contagens contra o manifesto. NÃO toca no banco real.
async function testarRestauracao() {
  const s = supa();
  if (!s) throw new Error('Supabase não configurado');
  const pastas = (await s.listar('semanal/')).map((o) => o.name).filter((n) => /^\d{4}-/.test(n)).sort();
  if (!pastas.length) throw new Error('nenhum backup no Supabase');
  const pasta = 'semanal/' + pastas[pastas.length - 1];
  const man = JSON.parse((await s.baixar(pasta + '/manifesto.json')).toString());
  const dir = path.join(DIR_BACKUPS, 'teste-restauracao');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const pacote = path.join(dir, man.arquivo);
  for (const p of man.partes) {
    const buf = await s.baixar(pasta + '/' + p.nome);
    if (sha256(buf) !== p.sha256) throw new Error('parte ' + p.nome + ' corrompida');
    fs.appendFileSync(pacote, buf);
  }
  if (sha256Arquivo(pacote) !== man.sha256) throw new Error('pacote remontado não confere com o sha256 do manifesto');
  execFileSync('tar', [...(process.platform === 'win32' ? ['--force-local'] : []), '-xzf', pacote, '-C', dir]);
  const db = abrirCopia(path.join(dir, 'app.db'));
  const integ = db.tudo('PRAGMA integrity_check');
  const cont = contagensDaCopia(db, Object.keys(man.contagens));
  db.fechar();
  const dif = diferencas(man.contagens, cont);
  if (String(Object.values(integ[0])[0]) !== 'ok' || dif.length) throw new Error('restauração não confere: ' + dif.join('; '));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[teste] Restauração OK do backup de ' + man.criadoEm + ': ' + man.partes.length + ' parte(s), hash confere, integridade OK, ' + Object.keys(cont).length + ' tabelas com contagens idênticas.');
  gravarHistorico({ quando: new Date().toISOString(), ok: true, teste: true, de: man.criadoEm });
}

(process.argv.includes('--testar') ? testarRestauracao() : backup())
  .then((r) => { process.exitCode = r && r.ok === false ? 1 : 0; })
  .catch((e) => { console.error('[backup] erro: ' + e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
