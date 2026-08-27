// Exportação de TODOS os dados de uma barbearia.
//
// Uma coleta só, escopada por barbeariaId, que alimenta os dois formatos:
//   - JSON  (exportacaoController.json) — cópia FIEL, serve para restaurar.
//   - PDF   (exportacaoController.pdf)  — legível, serve para ler/imprimir.
//
// Tudo é filtrado por barbeariaId. Nenhuma query pode sair sem esse filtro:
// é ele que impede uma barbearia de baixar os dados de outra.
const prisma = require('../config/db');

// Junta o banco inteiro de UMA barbearia num objeto só. As relações que valem
// para restaurar (itens e pagamentos de cada agendamento) vêm aninhadas.
async function coletarDados(barbeariaId) {
  if (!barbeariaId) throw new Error('coletarDados exige barbeariaId');
  const where = { barbeariaId };

  const [
    barbearia,
    usuarios,
    horariosTrabalho,
    bloqueios,
    categoriasServico,
    servicos,
    clientes,
    planos,
    clientePlanos,
    agendamentos,
    categoriasCaixa,
    caixa,
    categoriasEstoque,
    estoque,
    cupons,
    resgatesFidelidade,
    configuracoes,
  ] = await Promise.all([
    prisma.barbearia.findUnique({ where: { id: barbeariaId } }),
    prisma.usuario.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.horarioTrabalho.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.bloqueio.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.categoriaServico.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.servico.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.cliente.findMany({ where, orderBy: { nome: 'asc' } }),
    prisma.plano.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.clientePlano.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.agendamento.findMany({
      where,
      orderBy: { data: 'asc' },
      include: { itens: true, pagamentos: true },
    }),
    prisma.categoriaCaixa.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.caixa.findMany({ where, orderBy: { data: 'asc' } }),
    prisma.categoriaEstoque.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.estoque.findMany({ where, orderBy: { nome: 'asc' } }),
    prisma.cupom.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.fidelidadeResgate.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.configuracao.findMany({ where, orderBy: { id: 'asc' } }),
  ]);

  return {
    barbearia,
    usuarios,
    horariosTrabalho,
    bloqueios,
    categoriasServico,
    servicos,
    clientes,
    planos,
    clientePlanos,
    agendamentos,
    categoriasCaixa,
    caixa,
    categoriasEstoque,
    estoque,
    cupons,
    resgatesFidelidade,
    configuracoes,
  };
}

// Remove a senha criptografada da equipe. O JSON de restauração MANTÉM o hash
// (senão os logins se perdem); o PDF, que é para ler e imprimir, não pode
// carregar isso — é dado sensível sem nenhuma serventia na leitura.
function semSenhas(usuarios) {
  return usuarios.map((u) => {
    const { senhaHash, ...resto } = u;
    return resto;
  });
}

module.exports = { coletarDados, semSenhas };
