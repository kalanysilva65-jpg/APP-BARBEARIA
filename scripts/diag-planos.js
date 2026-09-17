// Diagnóstico de planos: mostra os cadastros (por variantes de telefone) e as
// assinaturas de cada um, com o status de vigência — pra entender por que a
// secretária "não acha o plano" de um cliente.
//
// Uso:  node scripts/diag-planos.js <telefone> [barbeariaId]
//   ex: node scripts/diag-planos.js 5551996204941
//       node scripts/diag-planos.js 51996204941 2
const prisma = require('../src/config/db');
const { variantesTelefone } = require('../src/utils/telefone');
const planoServ = require('../src/services/plano');

(async () => {
  const tel = process.argv[2];
  const barbeariaId = process.argv[3] ? Number(process.argv[3]) : null;
  if (!tel) {
    console.log('uso: node scripts/diag-planos.js <telefone> [barbeariaId]');
    process.exit(1);
  }
  const variantes = variantesTelefone(tel);
  console.log('Telefone informado:', tel);
  console.log('Variantes buscadas:', variantes.join(', '));

  const where = { telefone: { in: variantes } };
  if (barbeariaId) where.barbeariaId = barbeariaId;

  const clientes = await prisma.cliente.findMany({
    where,
    include: { planos: { include: { plano: true } } },
  });

  if (!clientes.length) {
    console.log('\n>> NENHUM cadastro encontrado com essas variantes.');
    console.log('   (o cliente pode estar salvo com outro número, ou não existe)');
    process.exit(0);
  }

  console.log(`\n${clientes.length} cadastro(s) encontrado(s):`);
  for (const c of clientes) {
    const nasc = c.dataNascimento ? new Date(c.dataNascimento).toISOString().slice(0, 10) : '-';
    console.log(`\n• Cliente #${c.id} | barbearia ${c.barbeariaId} | "${c.nome}" | tel ${c.telefone} | nasc ${nasc}`);
    if (!c.planos.length) {
      console.log('    (sem nenhuma assinatura vinculada)');
      continue;
    }
    for (const a of c.planos) {
      const fim = a.dataFim ? new Date(a.dataFim).toISOString().slice(0, 10) : '-';
      console.log(
        `    assinatura #${a.id} | plano "${a.plano.nome}" | ativo=${a.ativo} | usosRestantes=${a.usosRestantes} | validade até ${fim} | VIGENTE=${planoServ.vigente(a)}`
      );
    }
  }
  console.log('\nRegra de VIGENTE = ativo E dentro da validade E (ilimitado OU usosRestantes > 0).');
  process.exit(0);
})().catch((e) => {
  console.error('erro no diagnóstico:', e);
  process.exit(1);
});
