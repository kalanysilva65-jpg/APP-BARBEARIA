// Conta de demonstração para o revisor da Meta (App Review do WhatsApp).
//
// Igual em espírito ao conta-revisor-apple.js, mas SEPARADA: um login próprio
// (revisor-meta@cortavo.com.br) para NÃO interferir na conta/senha que está no
// formulário da Apple. Reusa a MESMA "Barbearia Demonstração" (slug 'demo',
// dados fictícios) — o revisor da Meta navega o painel (tela Secretária com o
// botão "Conectar WhatsApp" e a Caixa de entrada/Conversas) sem ver dado real.
//
// POR QUE UM REVISOR SEPARADO
// O revisor-apple.js grava a senha no campo "Sign-In Information" da Apple.
// Resetar aquela senha para dar uma à Meta quebraria uma revisão da Apple em
// andamento. Um usuário próprio para a Meta evita esse acoplamento.
//
// USO (no VPS, dentro de /home/cortavo/app):
//   node deploy/conta-revisor-meta.js               # cria/repõe; MANTÉM a senha atual
//   node deploy/conta-revisor-meta.js --senha=XXX   # (re)define a senha do revisor
//   node deploy/conta-revisor-meta.js --remover     # apaga só este usuário
//
// A "Barbearia Demonstração" precisa existir (rode antes o conta-revisor-apple.js
// se ainda não existir). Este script NÃO mexe na barbearia nem nos dados dela —
// só no usuário revisor da Meta. É idempotente.
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');

const SLUG = 'demo';
const EMAIL = 'revisor-meta@cortavo.com.br';

const args = process.argv.slice(2);
const REMOVER = args.includes('--remover');
const senhaArg = (args.find((a) => a.startsWith('--senha=')) || '').slice('--senha='.length);

// Sem O/0 nem I/l/1 — mesmo cuidado do revisor da Apple, caso alguém digite à mão.
function sortearSenha() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(14);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

async function main() {
  const barbearia = await prisma.barbearia.findUnique({ where: { slug: SLUG } });
  if (!barbearia) {
    console.log('A "Barbearia Demonstração" (slug "' + SLUG + '") não existe.');
    console.log('Rode antes:  node deploy/conta-revisor-apple.js');
    process.exitCode = 1;
    return;
  }
  const bid = barbearia.id;

  if (REMOVER) {
    const u = await prisma.usuario.findUnique({ where: { barbeariaId_email: { barbeariaId: bid, email: EMAIL } } });
    if (!u) {
      console.log('Nada a remover: o revisor da Meta não existe.');
      return;
    }
    // Agendamento->Usuario é Restrict; este usuário não recebe agendamentos, mas
    // por segurança apaga os dele (e os horários) antes de remover.
    await prisma.agendamento.deleteMany({ where: { usuarioId: u.id } });
    await prisma.horarioTrabalho.deleteMany({ where: { usuarioId: u.id } });
    await prisma.usuario.delete({ where: { id: u.id } });
    console.log('Removido o revisor da Meta (' + EMAIL + ').');
    return;
  }

  // Senha: PRESERVA a atual quando o revisor já existe e nenhuma --senha veio
  // (re-rodar só pra repor dados não pode trocar o login que está no formulário).
  const existente = await prisma.usuario.findUnique({
    where: { barbeariaId_email: { barbeariaId: bid, email: EMAIL } },
  });
  const preservarSenha = !!existente && !senhaArg;
  const senha = preservarSenha ? null : senhaArg || sortearSenha();
  const revisor = await prisma.usuario.upsert({
    where: { barbeariaId_email: { barbeariaId: bid, email: EMAIL } },
    update: preservarSenha
      ? { ativo: true, papel: 'admin' }
      : { ativo: true, papel: 'admin', senhaHash: bcrypt.hashSync(senha, 10) },
    create: {
      barbeariaId: bid,
      nome: 'Meta App Review',
      email: EMAIL,
      senhaHash: bcrypt.hashSync(senha || sortearSenha(), 10),
      papel: 'admin',
    },
  });

  // Jornada de trabalho (não força; só cria se ainda não tiver) — deixa a conta
  // completa para o revisor navegar a agenda sem telas quebradas.
  const temHorario = await prisma.horarioTrabalho.count({ where: { usuarioId: revisor.id } });
  if (!temHorario) {
    for (let d = 0; d <= 6; d++) {
      await prisma.horarioTrabalho.create({
        data: { barbeariaId: bid, usuarioId: revisor.id, diaSemana: d, horaInicio: '09:00', horaFim: '20:00', trabalha: d !== 0 },
      });
    }
  }

  console.log('');
  console.log('  Barbearia .. ' + barbearia.nome + '  (slug "' + SLUG + '")');
  if (preservarSenha) {
    console.log('  Login do revisor da Meta: ' + EMAIL + '  (senha MANTIDA — a mesma que já estava)');
    console.log('');
  } else {
    console.log('  ---- copie para o campo de credenciais de teste do App Review ----');
    console.log('  URL ..... https://cortavo.com.br/login');
    console.log('  E-mail .. ' + EMAIL);
    console.log('  Senha ... ' + senha);
    console.log('  ------------------------------------------------------------------');
    console.log('');
    if (!senhaArg) {
      console.log('  A senha foi sorteada agora e NÃO fica gravada em lugar nenhum. Anote antes de fechar.');
      console.log('');
    }
  }
}

main()
  .catch((e) => {
    console.error('Falhou:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
