// Limpa MOVIMENTO + CADASTROS de uma barbearia, mantendo a "casca":
// a barbearia, os logins da equipe (usuários + aparelhos de push), as
// CONFIGURAÇÕES (WhatsApp conectado, logo, secretária) e o log de auditoria.
//
// SEGURANÇA
//  - Por padrão só SIMULA: mostra quanto seria apagado e não apaga nada.
//  - Para apagar: --executar --confirmar=<slug da barbearia> (o slug tem que
//    bater, pra não limpar a barbearia errada por um id trocado).
//  - Antes de apagar, faz BACKUP do banco inteiro (VACUUM INTO, consistente
//    mesmo com WAL) ao lado do arquivo do banco.
//  - Tudo numa TRANSAÇÃO: se algo falhar no meio, nada é apagado.
//
// USO (no VPS, dentro de /home/cortavo/app):
//   sudo -u cortavo node scripts/limpar-barbearia.js --id=1                          # simula
//   sudo -u cortavo node scripts/limpar-barbearia.js --id=1 --executar --confirmar=SLUG # apaga
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/db');

const args = process.argv.slice(2);
const arg = (n) => (args.find((a) => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=');
const ID = Number(arg('id'));
const EXECUTAR = args.includes('--executar');
const CONFIRMAR = arg('confirmar');

// Ordem importa: algumas relações são Restrict (Agendamento->Usuario,
// ClientePlano->Plano, AgendamentoItem->Servico), então filhos primeiro.
// Mesma ordem do deploy/conta-revisor-apple.js, que já roda em produção.
const ETAPAS = [
  ['caixa', 'Lançamentos de caixa'],
  ['clientePlano', 'Planos vendidos (assinaturas)'],
  ['fidelidadeResgate', 'Resgates de fidelidade'],
  ['plano', 'Planos oferecidos'],
  ['cupom', 'Cupons'],
  ['meta', 'Metas'],
  ['servicoInsumo', 'Ficha técnica (insumos por serviço)'],
  ['lembreteLog', 'Registro de lembretes enviados'],
  ['agendamento', 'Agendamentos (+ itens e pagamentos, em cascata)'],
  ['conversa', 'Conversas da secretária (+ mensagens, em cascata)'],
  ['cliente', 'Clientes'],
  ['servico', 'Serviços e produtos (+ preços por barbeiro, em cascata)'],
  ['estoque', 'Itens de estoque'],
  ['categoriaEstoque', 'Categorias de estoque'],
  ['categoriaCaixa', 'Categorias de caixa'],
  ['categoriaServico', 'Categorias de serviço'],
  ['horarioTrabalho', 'Horários de trabalho da equipe'],
  ['bloqueio', 'Bloqueios de agenda'],
  ['usoIA', 'Uso de IA (contadores mensais)'],
  ['usoIAModelo', 'Uso de IA por modelo'],
];

async function caminhoDoBanco() {
  const linhas = await prisma.$queryRawUnsafe('PRAGMA database_list');
  const main = linhas.find((l) => l.name === 'main');
  return main && main.file;
}

async function main() {
  if (!ID) {
    console.log('Informe a barbearia: --id=<número>');
    process.exitCode = 1;
    return;
  }
  const b = await prisma.barbearia.findUnique({ where: { id: ID } });
  if (!b) {
    console.log('Barbearia ' + ID + ' não existe.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('  Barbearia: ' + b.nome + '  (id ' + b.id + ', slug "' + b.slug + '")');
  console.log('  ' + (EXECUTAR ? 'MODO: EXECUTAR (vai apagar)' : 'MODO: SIMULAÇÃO (nada será apagado)'));
  console.log('');

  let total = 0;
  for (const [modelo, rotulo] of ETAPAS) {
    const n = await prisma[modelo].count({ where: { barbeariaId: ID } });
    total += n;
    console.log('  ' + String(n).padStart(7) + '  ' + rotulo);
  }
  const mantidos = {
    usuarios: await prisma.usuario.count({ where: { barbeariaId: ID } }),
    configuracoes: await prisma.configuracao.count({ where: { barbeariaId: ID } }),
  };
  console.log('  -------');
  console.log('  ' + String(total).padStart(7) + '  registros a apagar');
  console.log('');
  console.log('  MANTIDOS: a barbearia, ' + mantidos.usuarios + ' login(s) da equipe, ' + mantidos.configuracoes + ' configuração(ões) (WhatsApp, logo, secretária).');
  console.log('');

  if (!EXECUTAR) {
    console.log('  Nada foi apagado. Para apagar de verdade:');
    console.log('    node scripts/limpar-barbearia.js --id=' + ID + ' --executar --confirmar=' + b.slug);
    console.log('');
    return;
  }
  if (CONFIRMAR !== b.slug) {
    console.log('  ABORTADO: --confirmar precisa ser exatamente o slug "' + b.slug + '".');
    process.exitCode = 1;
    return;
  }

  // Fotos dos serviços: guardadas antes de apagar, removidas do disco só DEPOIS
  // que a transação der certo.
  const fotos = (await prisma.servico.findMany({ where: { barbeariaId: ID, fotoUrl: { not: null } }, select: { fotoUrl: true } }))
    .map((s) => s.fotoUrl);

  // Backup consistente do banco inteiro antes de qualquer exclusão.
  const arquivo = await caminhoDoBanco();
  if (!arquivo) throw new Error('não consegui descobrir o arquivo do banco para o backup');
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(path.dirname(arquivo), 'backup-antes-limpeza-' + b.slug + '-' + carimbo + '.db');
  await prisma.$executeRawUnsafe("VACUUM INTO '" + backup.replace(/'/g, "''") + "'");
  console.log('  Backup salvo em: ' + backup);

  await prisma.$transaction(async (tx) => {
    for (const [modelo] of ETAPAS) {
      await tx[modelo].deleteMany({ where: { barbeariaId: ID } });
    }
  }, { timeout: 120000 });

  let removidas = 0;
  for (const url of fotos) {
    try {
      const { caminhoDoUpload } = require('../src/config/paths');
      const f = caminhoDoUpload(url);
      if (f && fs.existsSync(f)) { fs.unlinkSync(f); removidas++; }
    } catch (_) { /* foto ausente não impede nada */ }
  }

  console.log('  Limpeza concluída: ' + total + ' registros apagados, ' + removidas + ' foto(s) de serviço removida(s).');
  console.log('  Para desfazer: pare o app e restaure o backup acima no lugar do banco.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Falhou (nada foi apagado se o erro veio antes/dentro da transação):', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
