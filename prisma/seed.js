// Seed inicial do banco.
// É idempotente: pode rodar várias vezes sem duplicar nem apagar dados.
// Cria a equipe (1 admin + 2 funcionários), as jornadas padrão e alguns
// serviços/produtos/estoque/categorias de exemplo.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');

async function main() {
  console.log('› Populando o banco...');

  // --- Equipe (3 barbeiros) -------------------------------------------------
  const equipe = [
    { nome: 'Rafael Chefe', email: 'admin@barbearia.com', senha: 'admin123', papel: 'admin' },
    { nome: 'Bruno Lima', email: 'bruno@barbearia.com', senha: 'func123', papel: 'funcionario' },
    { nome: 'Carlos Souza', email: 'carlos@barbearia.com', senha: 'func123', papel: 'funcionario' },
  ];

  const usuarios = [];
  for (const u of equipe) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: {}, // não sobrescreve quem já existe
      create: {
        nome: u.nome,
        email: u.email,
        senhaHash: bcrypt.hashSync(u.senha, 10),
        papel: u.papel,
      },
    });
    usuarios.push(usuario);
  }

  // --- Jornada padrão: segunda a sábado 09:00–20:00, domingo de folga -------
  for (const usuario of usuarios) {
    const qtd = await prisma.horarioTrabalho.count({ where: { usuarioId: usuario.id } });
    if (qtd === 0) {
      for (let dia = 0; dia <= 6; dia++) {
        await prisma.horarioTrabalho.create({
          data: {
            usuarioId: usuario.id,
            diaSemana: dia,
            horaInicio: '09:00',
            horaFim: '20:00',
            trabalha: dia !== 0, // 0 = domingo => folga
          },
        });
      }
    }
  }

  // --- Categorias e serviços de exemplo (só se ainda não houver serviços) ---
  if ((await prisma.servico.count()) === 0) {
    const catCortes = await prisma.categoriaServico.create({ data: { nome: 'Cortes' } });
    const catBarba = await prisma.categoriaServico.create({ data: { nome: 'Barba' } });
    const catPomadas = await prisma.categoriaServico.create({ data: { nome: 'Pomadas' } });
    const catCremes = await prisma.categoriaServico.create({ data: { nome: 'Cremes' } });

    await prisma.servico.createMany({
      data: [
        { nome: 'Corte Masculino', categoriaId: catCortes.id, valor: 4000, duracaoMin: 30 },
        { nome: 'Corte + Barba', categoriaId: catCortes.id, valor: 6000, duracaoMin: 60 },
        { nome: 'Barba', categoriaId: catBarba.id, valor: 3000, duracaoMin: 30 },
        { nome: 'Pigmentação', categoriaId: catCortes.id, valor: 7000, duracaoMin: 60 },
        { nome: 'Pomada Modeladora', categoriaId: catPomadas.id, valor: 3500, duracaoMin: 0, ehProduto: true },
        { nome: 'Creme Hidratante', categoriaId: catCremes.id, valor: 2500, duracaoMin: 0, ehProduto: true },
      ],
    });
  }

  // --- Estoque de exemplo (só se ainda não houver itens) --------------------
  if ((await prisma.estoque.count()) === 0) {
    const catLaminas = await prisma.categoriaEstoque.create({ data: { nome: 'Lâminas e Navalhas' } });
    const catLimpeza = await prisma.categoriaEstoque.create({ data: { nome: 'Produtos de Limpeza' } });
    const catDescart = await prisma.categoriaEstoque.create({ data: { nome: 'Descartáveis' } });

    await prisma.estoque.createMany({
      data: [
        { nome: 'Navalhas descartáveis', categoriaId: catLaminas.id, quantidade: 50, quantidadeMinima: 10, valorGasto: 3000 },
        { nome: 'Álcool 70%', categoriaId: catLimpeza.id, quantidade: 5, quantidadeMinima: 3, valorGasto: 1500 },
        { nome: 'Toalhas de papel', categoriaId: catDescart.id, quantidade: 2, quantidadeMinima: 5, valorGasto: 2000 }, // dispara o alerta
      ],
    });
  }

  // --- Categorias de caixa de exemplo (só se ainda não houver) --------------
  if ((await prisma.categoriaCaixa.count()) === 0) {
    await prisma.categoriaCaixa.createMany({
      data: [
        { nome: 'Corte', tipo: 'entrada' },
        { nome: 'Produto', tipo: 'entrada' },
        { nome: 'Insumos', tipo: 'saida' },
        { nome: 'Aluguel', tipo: 'saida' },
      ],
    });
  }

  // --- Configurações: toggle de caixa automático (começa desligado) ---------
  await prisma.configuracao.upsert({
    where: { chave: 'caixa_automatico' },
    update: {},
    create: { chave: 'caixa_automatico', valor: 'false' },
  });

  console.log('✓ Seed concluído.');
  console.log('  Logins de teste:');
  console.log('   admin@barbearia.com  / admin123  (Admin / Chefe)');
  console.log('   bruno@barbearia.com  / func123   (Funcionário 1)');
  console.log('   carlos@barbearia.com / func123   (Funcionário 2)');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Erro no seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
