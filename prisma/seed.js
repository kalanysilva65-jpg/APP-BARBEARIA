// Seed inicial do banco (MULTI-BARBEARIA) — configuração de PRODUÇÃO.
// Cria apenas:
//  - o DONO do sistema (super-admin do SaaS, painel-mestre, sem barbearia);
//  - a barbearia "Andrade" (slug "andrade") com o Bruno como admin, jornada
//    padrão e as configurações básicas — SEM catálogo/estoque de demonstração.
// É idempotente: pode rodar várias vezes sem duplicar nem sobrescrever dados.
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
// Se o e-mail do admin já existe em ALGUMA barbearia, é ela — mesmo que o slug
// tenha sido renomeado depois (pelo painel-mestre). Sem isso, um redeploy
// recriaria uma barbearia duplicada com o slug antigo.
async function garantirBarbearia(nome, slug, emailAdmin) {
  const porAdmin = await prisma.usuario.findFirst({
    where: { email: emailAdmin, barbeariaId: { not: null } },
    include: { barbearia: true },
  });
  if (porAdmin && porAdmin.barbearia) return porAdmin.barbearia;

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

// Configuração chave/valor por barbearia (idempotente; não sobrescreve valores existentes).
async function garantirConfig(barbeariaId, chave, valor) {
  await prisma.configuracao.upsert({
    where: { barbeariaId_chave: { barbeariaId, chave } },
    update: {},
    create: { barbeariaId, chave, valor },
  });
}

async function main() {
  console.log('› Populando o banco (produção: dono + Andrade)...');

  const dono = await garantirDono();

  // --- Barbearia: Andrade (só o admin Bruno; sem catálogo de demonstração) --
  const EMAIL_BRUNO = 'andradebarbearia@gmail.com';
  const andrade = await garantirBarbearia('Andrade Barbearia', 'andrade', EMAIL_BRUNO);
  const bruno = await garantirUsuario(andrade.id, {
    nome: 'Bruno Andrade',
    email: EMAIL_BRUNO,
    senha: 'admin123',
    papel: 'admin',
  });
  await garantirJornada(andrade.id, bruno.id);

  // Configurações básicas (não sobrescrevem se já existirem).
  await garantirConfig(andrade.id, 'caixa_automatico', 'false');
  await garantirConfig(andrade.id, 'logo_url', '');
  await garantirConfig(andrade.id, 'mostrar_powered_by', 'true');

  console.log('✓ Seed concluído.');
  console.log('');
  console.log('  DONO (painel-mestre):');
  console.log('   ' + dono.email + ' / dono123');
  console.log('');
  console.log(`  Barbearia "${andrade.slug}" (subdomínio ${andrade.slug} / dev: ?b=${andrade.slug}):`);
  console.log('   ' + EMAIL_BRUNO + ' / admin123  (Admin — Bruno)');
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
