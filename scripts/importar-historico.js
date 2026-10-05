// Importa o HISTÓRICO de atendimentos de outro app (arquivo JSON gerado a partir
// dos relatórios de comissão em PDF) para uma barbearia do Cortavo.
//
// O QUE ENTRA
//  - Cada atendimento vira um Agendamento CONCLUÍDO, com itens (serviços), a forma
//    de pagamento e a entrada no CAIXA — na data original (os relatórios, o caixa e
//    as comissões passam a mostrar o histórico de verdade).
//  - Barbeiros: usa o que já existe na barbearia (pelo nome); o que não existir é
//    criado como cadastro de equipe (sem login, igual à tela Equipe).
//  - Serviços: usa o que já existe (pelo nome, sem diferenciar maiúsculas); o que
//    não existir é criado INATIVO (aparece no histórico mas NÃO no agendamento
//    público nem na secretária) — o dono ativa o que quiser depois.
//
// O QUE NÃO ENTRA
//  - Atendimentos "Pendente" (não pagos): vão listados no relatório, mas não são
//    importados. Vendas de produtos: o relatório original só traz o total do mês.
//  - Clientes (CRM): o relatório não traz telefone, e o Cortavo identifica cliente
//    por telefone. O nome fica no próprio atendimento.
//
// SEGURANÇA
//  - Por padrão só SIMULA. Para gravar: --executar --confirmar=<slug da barbearia>.
//  - Faz BACKUP do banco inteiro (VACUUM INTO) antes de gravar.
//  - Tudo numa TRANSAÇÃO: se algo falhar, nada é gravado.
//  - É re-executável: apaga a importação anterior (origem "importado") e refaz,
//    sem duplicar.
//
// USO (no VPS, dentro de /home/cortavo/app):
//   sudo -u cortavo node scripts/importar-historico.js --id=1 --arquivo=/caminho/andrade-historico.json
//   sudo -u cortavo node scripts/importar-historico.js --id=1 --arquivo=... --executar --confirmar=SLUG
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');

const args = process.argv.slice(2);
const arg = (n) => (args.find((a) => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=');
const ID = Number(arg('id'));
const ARQUIVO = arg('arquivo');
const EXECUTAR = args.includes('--executar');
const CONFIRMAR = arg('confirmar');
const ORIGEM = 'importado';

const real = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+,)/g, '.');
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function credenciaisInternas(nome) {
  const base = semAcento(nome).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'barbeiro';
  return { email: `${base}.${Date.now().toString(36)}@equipe.local`, senha: crypto.randomBytes(24).toString('hex') };
}

// Reparte `total` (centavos) entre os itens, proporcional ao peso; o resto vai no 1º.
function ratear(total, pesos) {
  if (total <= 0) return pesos.map(() => 0);
  const soma = pesos.reduce((a, b) => a + b, 0) || pesos.length;
  const partes = pesos.map((p) => Math.floor((total * (p || 1)) / soma));
  partes[0] += total - partes.reduce((a, b) => a + b, 0);
  return partes;
}

async function caminhoDoBanco() {
  const linhas = await prisma.$queryRawUnsafe('PRAGMA database_list');
  const main = linhas.find((l) => l.name === 'main');
  return main && main.file;
}

async function main() {
  if (!ID || (!ARQUIVO && !args.includes('--remover'))) {
    console.log('Uso: --id=<barbearia> --arquivo=<json> [--executar --confirmar=<slug>]');
    console.log('     --id=<barbearia> --remover --confirmar=<slug>   (apaga só o que foi importado)');
    process.exitCode = 1;
    return;
  }
  const b = await prisma.barbearia.findUnique({ where: { id: ID } });
  if (!b) { console.log('Barbearia ' + ID + ' não existe.'); process.exitCode = 1; return; }

  // --remover: apaga SÓ os atendimentos importados (e o caixa deles). Não mexe em
  // barbeiros nem serviços criados pela importação.
  if (args.includes('--remover')) {
    const velhos = await prisma.agendamento.findMany({ where: { barbeariaId: ID, origem: ORIGEM }, select: { id: true } });
    console.log('  ' + velhos.length + ' atendimentos importados na barbearia "' + b.nome + '".');
    if (CONFIRMAR !== b.slug) { console.log('  Para apagar: acrescente --confirmar=' + b.slug); return; }
    const ids = velhos.map((x) => x.id);
    await prisma.$transaction([
      prisma.caixa.deleteMany({ where: { agendamentoId: { in: ids } } }),
      prisma.agendamento.deleteMany({ where: { id: { in: ids } } }),
    ]);
    console.log('  Removidos. (Barbeiros e serviços criados pela importação foram mantidos.)');
    return;
  }
  const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  const atend = dados.atendimentos || [];

  // ---- Barbeiros ----
  const equipe = await prisma.usuario.findMany({ where: { barbeariaId: ID } });
  const profs = {};
  const novosProfs = [];
  for (const nome of [...new Set(atend.map((a) => a.profissional))]) {
    const alvo = semAcento(nome);
    const primeiro = alvo.split(' ')[0];
    let u = equipe.find((x) => semAcento(x.nome) === alvo)
      || equipe.find((x) => semAcento(x.nome).split(' ')[0] === primeiro && (equipe.filter((y) => semAcento(y.nome).split(' ')[0] === primeiro).length === 1));
    if (u) profs[nome] = { id: u.id, existente: true, nome: u.nome };
    else { profs[nome] = { id: null, existente: false, nome }; novosProfs.push(nome); }
  }

  // ---- Serviços ----
  const servicosExist = await prisma.servico.findMany({ where: { barbeariaId: ID, ehProduto: false } });
  const mapaServ = new Map(servicosExist.map((s) => [semAcento(s.nome), s]));
  const usados = [...new Set(atend.flatMap((a) => a.servicos))];
  const novosServ = usados.filter((n) => !mapaServ.has(semAcento(n)));

  // ---- Resumo / conferência ----
  const total = atend.reduce((s, a) => s + (a.valor || 0), 0);
  const porMes = {};
  atend.forEach((a) => {
    const k = a.data.slice(0, 7) + ' ' + a.profissional;
    porMes[k] = porMes[k] || { n: 0, valor: 0 };
    porMes[k].n++; porMes[k].valor += a.valor || 0;
  });
  const anteriores = await prisma.agendamento.count({ where: { barbeariaId: ID, origem: ORIGEM } });

  console.log('');
  console.log('  Barbearia: ' + b.nome + '  (id ' + b.id + ', slug "' + b.slug + '")');
  console.log('  Arquivo .... ' + path.basename(ARQUIVO) + ' — ' + atend.length + ' atendimentos, ' + real(total));
  console.log('  MODO ....... ' + (EXECUTAR ? 'EXECUTAR (vai gravar)' : 'SIMULAÇÃO (nada será gravado)'));
  console.log('');
  console.log('  Barbeiros:');
  Object.entries(profs).forEach(([n, p]) => console.log('    - ' + n + ' -> ' + (p.existente ? 'já existe ("' + p.nome + '", id ' + p.id + ')' : 'SERÁ CRIADO (cadastro de equipe, sem login)')));
  console.log('  Serviços: ' + (usados.length - novosServ.length) + ' já existem, ' + novosServ.length + ' serão criados INATIVOS:');
  if (novosServ.length) console.log('    ' + novosServ.join(', '));
  console.log('  Por mês e barbeiro:');
  Object.keys(porMes).sort().forEach((k) => console.log('    ' + k.padEnd(22) + String(porMes[k].n).padStart(4) + ' atend.  ' + real(porMes[k].valor).padStart(14)));
  console.log('  Ignorados (pendentes/não pagos): ' + (dados.ignorados || []).length);
  if (anteriores) console.log('  Importação ANTERIOR encontrada (' + anteriores + ' atendimentos): será apagada e refeita.');
  console.log('');

  if (!EXECUTAR) {
    console.log('  Nada foi gravado. Para gravar:');
    console.log('    node scripts/importar-historico.js --id=' + ID + ' --arquivo=' + ARQUIVO + ' --executar --confirmar=' + b.slug);
    console.log('');
    return;
  }
  if (CONFIRMAR !== b.slug) {
    console.log('  ABORTADO: --confirmar precisa ser exatamente o slug "' + b.slug + '".');
    process.exitCode = 1;
    return;
  }

  // Backup consistente do banco inteiro antes de gravar.
  const arquivoBanco = await caminhoDoBanco();
  if (!arquivoBanco) throw new Error('não consegui descobrir o arquivo do banco para o backup');
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(path.dirname(arquivoBanco), 'backup-antes-importacao-' + b.slug + '-' + carimbo + '.db');
  await prisma.$executeRawUnsafe("VACUUM INTO '" + backup.replace(/'/g, "''") + "'");
  console.log('  Backup salvo em: ' + backup);

  const resultado = await prisma.$transaction(async (tx) => {
    // 1) apaga a importação anterior (caixa primeiro: a FK do caixa é SetNull)
    const velhos = await tx.agendamento.findMany({ where: { barbeariaId: ID, origem: ORIGEM }, select: { id: true } });
    if (velhos.length) {
      const ids = velhos.map((x) => x.id);
      await tx.caixa.deleteMany({ where: { agendamentoId: { in: ids } } });
      await tx.agendamento.deleteMany({ where: { id: { in: ids } } });
    }
    // 2) barbeiros novos
    for (const nome of novosProfs) {
      const cred = credenciaisInternas(nome);
      const u = await tx.usuario.create({
        data: { barbeariaId: ID, nome, email: cred.email, senhaHash: await bcrypt.hash(cred.senha, 10), papel: 'funcionario', comissaoPercentual: 50 },
      });
      profs[nome] = { id: u.id, existente: false, nome };
    }
    // 3) serviços novos (inativos)
    const servMap = new Map(servicosExist.map((s) => [semAcento(s.nome), s]));
    for (const nome of novosServ) {
      const usual = (dados.catalogo && dados.catalogo[nome] && dados.catalogo[nome].valorUsual) || 0;
      const s = await tx.servico.create({ data: { barbeariaId: ID, nome, valor: usual, duracaoMin: 30, ativo: false, ehProduto: false } });
      servMap.set(semAcento(nome), s);
    }
    // 4) atendimentos
    let criados = 0;
    for (const a of atend) {
      const [yy, mm, dd] = a.data.split('-').map(Number);
      const dia = new Date(yy, mm - 1, dd);
      const concluidoEm = new Date(yy, mm - 1, dd, 12, 0, 0);
      const valor = a.valor || 0;
      const pesos = a.servicos.map((n) => (dados.catalogo && dados.catalogo[n] && dados.catalogo[n].valorUsual) || 1);
      const partes = ratear(valor, pesos);
      const formaOk = ['pix', 'credito', 'debito', 'dinheiro'].includes(a.forma) ? a.forma : null;
      await tx.agendamento.create({
        data: {
          barbeariaId: ID,
          usuarioId: profs[a.profissional].id,
          clienteNome: a.cliente,
          clienteTelefone: '',
          data: dia,
          horaInicio: '12:00',
          status: 'concluido',
          concluidoEm,
          valorTotal: valor,
          formaPagamento: formaOk,
          origem: ORIGEM,
          criadoEm: dia,
          itens: { create: a.servicos.map((n, i) => ({ servicoId: servMap.get(semAcento(n)).id, valorUnitario: partes[i], quantidade: 1 })) },
          pagamentos: valor > 0 && formaOk ? { create: [{ barbeariaId: ID, valor, formaPagamento: formaOk, parcelas: 1 }] } : undefined,
          caixa: valor > 0
            ? { create: [{ barbeariaId: ID, descricao: 'Atendimento — ' + a.cliente, valor, tipo: 'entrada', data: concluidoEm, formaPagamento: formaOk }] }
            : undefined,
        },
      });
      criados++;
    }
    return { criados, novosProfs: novosProfs.length, novosServ: novosServ.length };
  }, { timeout: 600000, maxWait: 60000 });

  console.log('  Importação concluída: ' + resultado.criados + ' atendimentos, ' + resultado.novosProfs + ' barbeiro(s) novo(s), ' + resultado.novosServ + ' serviço(s) novo(s) (inativos).');
  console.log('  Para desfazer: pare o app e restaure o backup acima no lugar do banco (ou rode de novo com --remover-importacao).');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Falhou (nada foi gravado se o erro veio antes/dentro da transação):', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
