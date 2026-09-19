// Diagnóstico de perfis de cliente DUPLICADOS (read-only, não mexe em nada).
// Acha cadastros que são a MESMA pessoa salva em formatos de telefone
// diferentes (o caso do 9º dígito: "51999832112" x "5199832112"), agrupando
// pela forma canônica do número DENTRO de cada barbearia.
//
// Para cada grupo duplicado mostra os cadastros com nº de agendamentos e planos,
// pra decidir qual MANTER (normalmente o de telefone canônico e/ou com mais
// histórico). NÃO altera o banco — a mesclagem é um passo separado.
//
// Uso:  node scripts/diag-duplicados.js [barbeariaId]
//   ex: node scripts/diag-duplicados.js
//       node scripts/diag-duplicados.js 1
const prisma = require('../src/config/db');
const { telefoneCanonicoBR } = require('../src/utils/telefone');

(async () => {
  const barbeariaId = process.argv[2] ? Number(process.argv[2]) : null;
  const where = barbeariaId ? { barbeariaId } : {};

  const clientes = await prisma.cliente.findMany({
    where,
    include: { _count: { select: { agendamentos: true, planos: true } } },
    orderBy: { id: 'asc' },
  });

  // Agrupa por barbearia + telefone canônico.
  const grupos = new Map();
  for (const c of clientes) {
    const canon = telefoneCanonicoBR(c.telefone) || c.telefone || '';
    const chave = c.barbeariaId + '|' + canon;
    if (!grupos.has(chave)) grupos.set(chave, { barbeariaId: c.barbeariaId, canon, itens: [] });
    grupos.get(chave).itens.push(c);
  }

  const duplicados = Array.from(grupos.values()).filter((g) => g.itens.length > 1);

  console.log(`Cadastros analisados: ${clientes.length}${barbeariaId ? ' (barbearia ' + barbeariaId + ')' : ' (todas as barbearias)'}`);
  console.log(`Grupos DUPLICADOS encontrados: ${duplicados.length}\n`);

  if (!duplicados.length) {
    console.log('>> Nenhum perfil duplicado por variante de telefone. 🎉');
    process.exit(0);
  }

  for (const g of duplicados) {
    console.log(`— Barbearia ${g.barbeariaId} | número canônico ${g.canon} | ${g.itens.length} cadastros:`);
    // Sugere manter o que tem mais agendamentos; empate, o de telefone mais longo
    // (normalmente o que tem o 9) e depois o id menor (mais antigo).
    const ordenados = [...g.itens].sort((a, b) =>
      (b._count.agendamentos - a._count.agendamentos) ||
      ((b.telefone || '').length - (a.telefone || '').length) ||
      (a.id - b.id)
    );
    ordenados.forEach((c, i) => {
      const nasc = c.dataNascimento ? new Date(c.dataNascimento).toISOString().slice(0, 10) : '-';
      const marca = i === 0 ? '  [MANTER sugerido]' : '  [mesclar->manter]';
      console.log(`    #${c.id} | "${c.nome}" | tel ${c.telefone} | nasc ${nasc} | agendamentos ${c._count.agendamentos} | planos ${c._count.planos}${marca}`);
    });
    console.log('');
  }

  const totalExtras = duplicados.reduce((s, g) => s + (g.itens.length - 1), 0);
  console.log(`Total de cadastros que seriam MESCLADOS (removidos após juntar): ${totalExtras}`);
  console.log('Este script é só leitura. A mesclagem (mover agendamentos/planos e apagar o extra) é um passo separado, com confirmação.');
  process.exit(0);
})().catch((e) => {
  console.error('erro no diagnóstico:', e);
  process.exit(1);
});
