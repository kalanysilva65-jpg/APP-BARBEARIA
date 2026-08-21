#!/usr/bin/env node
// Cria os lançamentos de caixa que faltaram nos atendimentos já CONCLUÍDOS.
//
// Para que serve: a "entrada automática" nasceu desligada. Enquanto ela esteve
// assim, concluir um atendimento não gerava nada no caixa — a receita existia
// no atendimento e não aparecia no saldo nem nos relatórios. Ligar a chave só
// vale dali para frente; este script preenche o que ficou para trás.
//
// SIMULA POR PADRÃO. Sem `--aplicar` ele só MOSTRA o que faria e não grava nada.
//
//   node deploy/recuperar-caixa.js                    # simula tudo
//   node deploy/recuperar-caixa.js --de=2026-08-01    # simula a partir da data
//   node deploy/recuperar-caixa.js --aplicar          # grava de verdade
//
// CUIDADO — leia antes de usar `--aplicar`:
// Se você lançou alguma dessas receitas À MÃO no caixa, o script NÃO tem como
// saber: ele só enxerga que o atendimento não tem lançamento vinculado, e vai
// criar um. O valor apareceria duas vezes. Rode a simulação, confira a lista
// contra o que já existe no seu caixa, e use `--de=` para pegar só o período
// que você tem certeza que não lançou manualmente.
//
// Faça backup antes: ~/app/deploy/backup.sh
require('dotenv').config();
const prisma = require('../src/config/db');

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const argDe = (args.find((a) => a.startsWith('--de=')) || '').slice(5);

function brl(centavos) {
  return 'R$ ' + (centavos / 100).toFixed(2).replace('.', ',');
}
function dia(d) {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
}

async function main() {
  const where = { status: 'concluido', valorTotal: { gt: 0 } };
  if (/^\d{4}-\d{2}-\d{2}$/.test(argDe)) {
    const [a, m, d] = argDe.split('-').map(Number);
    where.concluidoEm = { gte: new Date(a, m - 1, d) };
  }

  const concluidos = await prisma.agendamento.findMany({
    where,
    include: { pagamentos: { orderBy: { id: 'asc' } }, caixa: true, barbearia: true },
    orderBy: { concluidoEm: 'asc' },
  });

  // Só interessa quem NÃO tem lançamento vinculado.
  const semLancamento = concluidos.filter((ag) => ag.caixa.length === 0);

  console.log('');
  console.log(aplicar ? '=== APLICANDO ===' : '=== SIMULAÇÃO (nada será gravado) ===');
  console.log(`Atendimentos concluídos no filtro: ${concluidos.length}`);
  console.log(`Sem lançamento no caixa:           ${semLancamento.length}`);
  console.log('');

  if (!semLancamento.length) {
    console.log('Nada a recuperar — todos os atendimentos concluídos já têm lançamento.');
    return;
  }

  let total = 0;
  let linhas = 0;
  for (const ag of semLancamento) {
    // Mesma regra do serviço de caixa: uma linha por forma de pagamento quando
    // a conta foi dividida; uma só com o total quando não há divisão gravada.
    const partes = ag.pagamentos.length
      ? ag.pagamentos.map((p) => ({
          valor: p.valor,
          formaPagamento: p.formaPagamento,
          sufixo: p.parcelas > 1 ? ` (${p.parcelas}x)` : '',
        }))
      : [{ valor: ag.valorTotal, formaPagamento: ag.formaPagamento || null, sufixo: '' }];

    const detalhe = partes.map((p) => `${brl(p.valor)} ${p.formaPagamento || 'sem forma'}`).join(' + ');
    console.log(`  ${dia(ag.concluidoEm || ag.data)}  ${brl(ag.valorTotal).padStart(11)}  ${ag.clienteNome}`);
    console.log(`      -> ${partes.length} lançamento(s): ${detalhe}`);

    total += ag.valorTotal;
    linhas += partes.length;

    if (aplicar) {
      for (const p of partes) {
        if (p.valor <= 0) continue;
        await prisma.caixa.create({
          data: {
            barbeariaId: ag.barbeariaId,
            descricao: 'Atendimento — ' + ag.clienteNome + p.sufixo,
            valor: p.valor,
            tipo: 'entrada',
            // A data do lançamento é a da CONCLUSÃO, igual ao fluxo normal:
            // é assim que ele cai no dia certo do saldo e dos relatórios.
            data: ag.concluidoEm || ag.data,
            agendamentoId: ag.id,
            categoriaId: null,
            formaPagamento: p.formaPagamento,
          },
        });
      }
    }
  }

  console.log('');
  console.log(`Total: ${brl(total)} em ${linhas} lançamento(s), de ${semLancamento.length} atendimento(s).`);
  console.log('');
  if (aplicar) {
    console.log('Gravado. Confira em Caixa e Relatórios.');
  } else {
    console.log('Isto foi só uma simulação — nada foi gravado.');
    console.log('Confira a lista acima contra o seu caixa. Se algum desses valores');
    console.log('você já lançou à mão, use --de=AAAA-MM-DD para pegar só o período seguro.');
    console.log('Para gravar: node deploy/recuperar-caixa.js --aplicar');
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
