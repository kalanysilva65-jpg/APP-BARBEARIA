// Redefine a senha do DONO (login do painel-mestre) — para quando a senha foi
// esquecida ou precisa ser trocada e não dá pra usar /trocar-senha.
//
// Gera uma senha PROVISÓRIA aleatória, mostra UMA vez no terminal (não fica
// gravada em lugar nenhum) e marca troca OBRIGATÓRIA no 1º login — a senha
// definitiva quem escolhe é o próprio dono, na tela de troca.
//
// USO (no VPS, dentro de /home/cortavo/app):
//   sudo -u cortavo node scripts/senha-dono.js                   # dono único
//   sudo -u cortavo node scripts/senha-dono.js --email=x@y.com   # se houver mais de um dono
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');

const emailArg = ((process.argv.find((a) => a.startsWith('--email=')) || '').slice('--email='.length) || '').trim().toLowerCase();

// Sem O/0 nem I/l/1: é digitada à mão.
function sortearSenha() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(14), (b) => alfabeto[b % alfabeto.length]).join('');
}

async function main() {
  const where = { barbeariaId: null, papel: 'dono' };
  if (emailArg) where.email = emailArg;
  const donos = await prisma.usuario.findMany({ where, select: { id: true, email: true, ativo: true } });

  if (!donos.length) {
    console.log(emailArg ? 'Nenhum dono com o e-mail ' + emailArg + '.' : 'Nenhum usuário dono encontrado.');
    process.exitCode = 1;
    return;
  }
  if (donos.length > 1) {
    console.log('Há mais de um dono. Rode de novo informando qual:');
    donos.forEach((d) => console.log('  --email=' + d.email));
    process.exitCode = 1;
    return;
  }

  const dono = donos[0];
  const senha = sortearSenha();
  await prisma.usuario.update({
    where: { id: dono.id },
    data: { senhaHash: await bcrypt.hash(senha, 10), senhaProvisoria: true, ativo: true },
  });

  console.log('');
  console.log('  Senha PROVISÓRIA do painel-mestre (anote agora — não fica gravada):');
  console.log('');
  console.log('    E-mail .. ' + dono.email);
  console.log('    Senha ... ' + senha);
  console.log('');
  console.log('  Entre em https://cortavo.com.br/login — o app vai pedir para você criar');
  console.log('  a senha definitiva logo no primeiro acesso.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Falhou:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
