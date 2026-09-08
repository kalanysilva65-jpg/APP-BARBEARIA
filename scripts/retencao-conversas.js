// Retenção LGPD (Fase 3.5): apaga conversas de WhatsApp sem atividade há mais de
// 12 meses (o prazo vive em src/services/atendimento.js -> RETENCAO_MESES).
//
// Rodar por cron, ex.: uma vez por dia de madrugada no VPS:
//   0 4 * * *  cd /home/cortavo/app && sudo -u cortavo node scripts/retencao-conversas.js >> /home/cortavo/logs/retencao.log 2>&1
require('dotenv').config();
const prisma = require('../src/config/db');
const atendimento = require('../src/services/atendimento');

(async () => {
  try {
    const n = await atendimento.expirarConversasAntigas();
    console.log(`[${new Date().toISOString()}] retenção: ${n} conversa(s) antiga(s) apagada(s).`);
  } catch (e) {
    console.error('retenção falhou:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
