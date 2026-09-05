// Trilha de auditoria do painel-mestre (super-admin do SaaS).
// Registra QUEM fez O QUÊ em QUAL alvo, com IP e horário. É chamado logo depois
// de cada ação administrativa sensível concluir (criar/excluir barbearia,
// suspender, resetar senha, impersonar...).
//
// Regra de robustez: o registro NUNCA pode derrubar a ação que ele documenta.
// A ação já mutou o banco; se a escrita do log falhar, é melhor perder o log
// (com um erro no console pra investigar) do que estourar um 500 na cara do
// dono depois do efeito já ter acontecido. Por isso o try/catch engole a falha.
const prisma = require('../config/db');

async function registrar(req, { acao, alvoTipo = null, alvoId = null, detalhe = null }) {
  try {
    const admin = (req.session && req.session.usuario) || {};
    await prisma.logAuditoria.create({
      data: {
        adminId: admin.id || null,
        adminNome: admin.nome || 'desconhecido',
        acao,
        alvoTipo,
        alvoId: alvoId != null ? Number(alvoId) : null,
        detalhe,
        // Com `trust proxy = 1` no server, req.ip já é o IP real do cliente
        // atrás do nginx (e não o do proxy).
        ip: (req.ip || '').replace(/^::ffff:/, '') || null,
      },
    });
  } catch (e) {
    console.error('[auditoria] falha ao registrar ação', acao, '-', e && e.message);
  }
}

module.exports = { registrar };
