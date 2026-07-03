// Seed inicial do banco (MULTI-BARBEARIA).
// Cria:
//  - o DONO do sistema (super-admin do SaaS, sem barbearia);
//  - a barbearia de demonstração "Andrade" (slug "andrade") com equipe, jornadas,
//    serviços, estoque, categorias de caixa e configurações;
//  - uma segunda barbearia "Teste" (slug "teste") só para validar o isolamento.
// É idempotente: pode rodar várias vezes sem duplicar.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');

// Cria o dono do sistema (barbeariaId = null). Idempotente por e-mail.
async function garantirDono() {
  const email = 'kalanysilva65@gmail.com';
  const existe = await prisma.usuario.findFirst({ where: { barbeariaId: null, email } });
  if (existe) return existe;
  return prisma.usuario.create({
    data: {
      barbeariaId: null,
      nome: 'Kalany (Dono)',
      email,
      senhaHash: bcrypt.hashSync('dono123', 10),
      papel: 'dono',
    },
  });
}

// Cria/garante uma barbearia pelo slug.
async function garantirBarbearia(nome, slug) {
  return prisma.barbearia.upsert({
    where: { slug },
    update: {},
    create: { nome, slug },
  });
}

// Cria/garante um usuário dentro de uma barbearia.
async function garantirUsuario(barbeariaId, { nome, email, senha, papel }) {
  return prisma.usuario.upsert({
    where: { barbeariaId_email: { barbeariaId, email } },
    update: {},
    create: { barbeariaId, nome, email, senhaHash: bcrypt.hashSync(senha, 10), papel },
  });
}

// Jornada padrão: segunda a sábado 09:00–20:00, domingo de folga.
async function garantirJornada(barbeariaId, usuarioId) {
  const qtd = await prisma.horarioTrabalho.count({ where: { usuarioId } });
  if (qtd > 0) return;
  for (let dia = 0; dia <= 6; dia++) {
    await prisma.horarioTrabalho.create({
      data: { barbeariaId, usuarioId, diaSemana: dia, horaInicio: '09:00', horaFim: '20:00', trabalha: dia !== 0 },
    });
  }
}

// Configuração chave/valor por barbearia (idempotente).
async function garantirConfig(barbeariaId, chave, valor) {
  await prisma.configuracao.upsert({
    where: { barbeariaId_chave: { barbeariaId, chave } },
    update: {},
    create: { barbeariaId, chave, valor },
  });
}

// Popula catálogo/estoque/caixa de exemplo numa barbearia (só se ainda não houver serviços).
async function popularConteudo(barbeariaId) {
  if ((await prisma.servico.count({ where: { barbeariaId } })) === 0) {
    const catCortes = await prisma.categoriaServico.create({ data: { barbeariaId, nome: 'Cortes' } });
    const catBarba = await prisma.categoriaServico.create({ data: { barbeariaId, nome: 'Barba' } });
    const catPomadas = await prisma.categoriaServico.create({ data: { barbeariaId, nome: 'Pomadas' } });
    const catCremes = await prisma.categoriaServico.create({ data: { barbeariaId, nome: 'Cremes' } });

    await prisma.servico.createMany({
      data: [
        { barbeariaId, nome: 'Corte Masculino', descricao: 'Corte tradicional com finalização.', categoriaId: catCortes.id, valor: 4000, duracaoMin: 30 },
        { barbeariaId, nome: 'Corte + Barba', descricao: 'Corte completo com barba alinhada.', categoriaId: catCortes.id, valor: 6000, duracaoMin: 60 },
        { barbeariaId, nome: 'Barba', descricao: 'Ajuste e modelagem com acabamento.', categoriaId: catBarba.id, valor: 3000, duracaoMin: 30 },
        { barbeariaId, nome: 'Pigmentação', descricao: 'Realce capilar com acabamento natural.', categoriaId: catCortes.id, valor: 7000, duracaoMin: 60 },
        { barbeariaId, nome: 'Pomada Modeladora', descricao: 'Fixação e brilho para o penteado.', categoriaId: catPomadas.id, valor: 3500, duracaoMin: 0, ehProduto: true },
        { barbeariaId, nome: 'Creme Hidratante', descricao: 'Hidratação para cabelo e barba.', categoriaId: catCremes.id, valor: 2500, duracaoMin: 0, ehProduto: true },
      ],
    });
  }

  if ((await prisma.estoque.count({ where: { barbeariaId } })) === 0) {
    const catLaminas = await prisma.categoriaEstoque.create({ data: { barbeariaId, nome: 'Lâminas e Navalhas' } });
    const catLimpeza = await prisma.categoriaEstoque.create({ data: { barbeariaId, nome: 'Produtos de Limpeza' } });
    const catDescart = await prisma.categoriaEstoque.create({ data: { barbeariaId, nome: 'Descartáveis' } });

    await prisma.estoque.createMany({
      data: [
        { barbeariaId, nome: 'Navalhas descartáveis', categoriaId: catLaminas.id, quantidade: 50, quantidadeMinima: 10, valorGasto: 3000 },
        { barbeariaId, nome: 'Álcool 70%', categoriaId: catLimpeza.id, quantidade: 5, quantidadeMinima: 3, valorGasto: 1500 },
        { barbeariaId, nome: 'Toalhas de papel', categoriaId: catDescart.id, quantidade: 2, quantidadeMinima: 5, valorGasto: 2000 },
      ],
    });
  }

  if ((await prisma.categoriaCaixa.count({ where: { barbeariaId } })) === 0) {
    await prisma.categoriaCaixa.createMany({
      data: [
        { barbeariaId, nome: 'Corte', tipo: 'entrada' },
        { barbeariaId, nome: 'Produto', tipo: 'entrada' },
        { barbeariaId, nome: 'Insumos', tipo: 'saida' },
        { barbeariaId, nome: 'Aluguel', tipo: 'saida' },
      ],
    });
  }

  await garantirConfig(barbeariaId, 'caixa_automatico', 'false');
  await garantirConfig(barbeariaId, 'logo_url', '');
  await garantirConfig(barbeariaId, 'mostrar_powered_by', 'true');
}

async function main() {
  console.log('› Populando o banco (multi-barbearia)...');

  const dono = await garantirDono();

  // --- Barbearia 1: Andrade (demo completa) --------------------------------
  const andrade = await garantirBarbearia('Andrade Barbearia', 'andrade');
  const equipeAndrade = [
    { nome: 'Bruno Andrade', email: 'andradebarbearia@gmail.com', senha: 'admin123', papel: 'admin' },
    { nome: 'Rafael', email: 'rafael@andrade.com', senha: 'func123', papel: 'funcionario' },
    { nome: 'Carlos Souza', email: 'carlos@andrade.com', senha: 'func123', papel: 'funcionario' },
  ];
  for (const u of equipeAndrade) {
    const usuario = await garantirUsuario(andrade.id, u);
    await garantirJornada(andrade.id, usuario.id);
  }
  await popularConteudo(andrade.id);

  // --- Barbearia 2: Teste (mínima, para validar isolamento) ----------------
  const teste = await garantirBarbearia('Barbearia Teste', 'teste');
  const adminTeste = await garantirUsuario(teste.id, {
    nome: 'Admin Teste', email: 'admin@teste.com', senha: 'admin123', papel: 'admin',
  });
  await garantirJornada(teste.id, adminTeste.id);
  await popularConteudo(teste.id);

  console.log('✓ Seed concluído.');
  console.log('');
  console.log('  DONO (painel-mestre):');
  console.log('   ' + dono.email + ' / dono123');
  console.log('');
  console.log('  Barbearia "andrade" (subdomínio andrade / dev: ?b=andrade):');
  console.log('   andradebarbearia@gmail.com / admin123  (Admin)');
  console.log('   rafael@andrade.com / func123           (Funcionário)');
  console.log('');
  console.log('  Barbearia "teste" (subdomínio teste / dev: ?b=teste):');
  console.log('   admin@teste.com / admin123             (Admin)');
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
