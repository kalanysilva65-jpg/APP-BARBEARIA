// Migração de dados SQLite -> Postgres (Supabase), em dois passos seguros.
//
// A estratégia é "exportar para JSON, depois importar do JSON" — e NÃO copiar
// direto de um banco para o outro no mesmo processo. Por quê: o Prisma Client é
// gerado para UM provider por vez. Separando em dois passos, cada passo usa o
// client já gerado (SQLite no export, Postgres no import) sem gambiarra de dois
// clients, e o JSON vira um BACKUP durável do estado antes da virada.
//
// USO:
//   1) Ainda no SQLite (schema provider = "sqlite"):
//        node deploy/migrar-supabase.js --exportar
//      -> gera deploy/_migracao-dados.json com TUDO, na ordem certa.
//
//   2) Depois de trocar o schema para postgresql, apontar DATABASE_URL/DIRECT_URL
//      para o Supabase e rodar `npx prisma migrate deploy` (cria as tabelas):
//        node deploy/migrar-supabase.js --importar
//      -> insere tudo preservando os IDs e reajusta as sequences.
//
// É SEGURO re-rodar o import (usa skipDuplicates). O arquivo JSON pode ser
// passado como 2º argumento; o padrão é deploy/_migracao-dados.json.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Ordem de INSERÇÃO respeitando as chaves estrangeiras. No export a ordem é
// irrelevante; no import ela é obrigatória — um filho nunca antes do seu pai.
// { model: nome do acessor do Prisma Client, table: nome real da tabela (@@map) }
const MODELOS = [
  { model: 'barbearia', table: 'barbearias' },
  { model: 'usuario', table: 'usuarios' },
  { model: 'contaCliente', table: 'contas_cliente' },
  { model: 'cliente', table: 'clientes' },
  { model: 'categoriaServico', table: 'categorias_servico' },
  { model: 'servico', table: 'servicos' },
  { model: 'categoriaEstoque', table: 'categorias_estoque' },
  { model: 'estoque', table: 'estoque' },
  { model: 'servicoInsumo', table: 'servico_insumos' },
  { model: 'plano', table: 'planos' },
  { model: 'clientePlano', table: 'cliente_planos' },
  { model: 'horarioTrabalho', table: 'horarios_trabalho' },
  { model: 'bloqueio', table: 'bloqueios' },
  { model: 'cupom', table: 'cupons' },
  { model: 'fidelidadeResgate', table: 'fidelidade_resgates' },
  { model: 'agendamento', table: 'agendamentos' },
  { model: 'agendamentoItem', table: 'agendamento_itens' },
  { model: 'pagamentoAgendamento', table: 'agendamento_pagamentos' },
  { model: 'categoriaCaixa', table: 'categorias_caixa' },
  { model: 'caixa', table: 'caixa' },
  { model: 'configuracao', table: 'configuracoes' },
  { model: 'dispositivoPush', table: 'dispositivos_push' },
  { model: 'logAuditoria', table: 'logs_auditoria' },
  { model: 'meta', table: 'metas' },
];

const ARQUIVO_PADRAO = path.join(__dirname, '_migracao-dados.json');

// Datas viram string ISO no JSON; o Prisma aceita Date no createMany, então
// revivemos qualquer string no formato ISO-8601 de volta para Date.
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
function reviverDatas(_chave, valor) {
  if (typeof valor === 'string' && RE_ISO.test(valor)) return new Date(valor);
  return valor;
}

async function exportar(arquivo) {
  console.log('Exportando do banco atual (SQLite)...\n');
  const dump = {};
  let total = 0;
  for (const { model } of MODELOS) {
    const linhas = await prisma[model].findMany();
    dump[model] = linhas;
    total += linhas.length;
    console.log(`  ${model.padEnd(22)} ${linhas.length}`);
  }
  fs.writeFileSync(arquivo, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`\nOK — ${total} registros salvos em ${arquivo}`);
  console.log('Guarde este arquivo: é o backup do estado antes da virada.');
}

async function importar(arquivo) {
  if (!fs.existsSync(arquivo)) {
    throw new Error(`Arquivo não encontrado: ${arquivo}. Rode --exportar primeiro.`);
  }
  const url = process.env.DATABASE_URL || '';
  if (url.startsWith('file:')) {
    throw new Error(
      'DATABASE_URL ainda aponta para SQLite (file:). Aponte para o Postgres do\n' +
        'Supabase e rode `npx prisma migrate deploy` antes de importar.'
    );
  }
  const dump = JSON.parse(fs.readFileSync(arquivo, 'utf8'), reviverDatas);

  console.log('Importando para o Postgres...\n');
  let total = 0;
  for (const { model } of MODELOS) {
    const linhas = dump[model] || [];
    if (linhas.length) {
      // skipDuplicates torna o import re-executável sem estourar em PK repetida.
      await prisma[model].createMany({ data: linhas, skipDuplicates: true });
    }
    total += linhas.length;
    console.log(`  ${model.padEnd(22)} ${linhas.length}`);
  }

  // Os IDs foram inseridos explicitamente; as sequences ainda estão em 1. Sem
  // reajustar, o PRÓXIMO insert do app colidiria com um ID já usado. Aqui
  // empurramos cada sequence para MAX(id)+1. pg_get_serial_sequence cobre tanto
  // SERIAL quanto IDENTITY (Postgres 10+).
  console.log('\nReajustando as sequences de ID...');
  for (const { table } of MODELOS) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
              (SELECT COALESCE(MAX(id), 0) FROM "${table}") + 1, false)`
    );
  }

  console.log(`\nOK — ${total} registros importados.`);
  console.log('Confira as contagens acima contra as do --exportar antes de virar o app.');
}

async function main() {
  const args = process.argv.slice(2);
  const modo = args.find((a) => a === '--exportar' || a === '--importar');
  const arquivo = args.find((a) => !a.startsWith('--')) || ARQUIVO_PADRAO;

  if (!modo) {
    console.log('Use: node deploy/migrar-supabase.js --exportar | --importar [arquivo.json]');
    process.exit(1);
  }
  if (modo === '--exportar') await exportar(arquivo);
  else await importar(arquivo);
}

main()
  .catch((e) => {
    console.error('\nFALHOU:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
