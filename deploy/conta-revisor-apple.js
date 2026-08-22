// Conta de demonstração para o revisor da Apple (e da Google).
//
// POR QUE ISTO EXISTE
// A Apple testa o app LOGADO: o formulário de submissão tem um campo
// "Sign-In Information" que é obrigatório quando o app pede login. Sem uma
// conta que funcione, a rejeição é automática e custa mais um ciclo de
// revisão de 1 a 3 dias.
//
// POR QUE NÃO ENTREGAR A CONTA DO BRUNO
// Duas razões, e a segunda é a séria:
//   1. O revisor mexe no app de verdade — concluir, cancelar, apagar. Isso
//      bagunçaria a agenda de uma barbearia em operação.
//   2. A tela de Clientes mostra nome e telefone de pessoas reais. Entregar
//      isso a um terceiro é vazamento de dado pessoal, e contradiz a própria
//      política de privacidade que declaramos no formulário.
//
// Por isso: uma barbearia separada, com gente inventada.
//
// A BARBEARIA NASCE `ativo: false` — DE PROPÓSITO
// Esse campo NÃO bloqueia o login no painel (o authController só olha
// `usuario.ativo`), mas bloqueia duas coisas que precisam ficar bloqueadas:
// a listagem do app do cliente (`/conta`, que filtra por `ativo: true`) e o
// agendamento público por subdomínio (tenant.js, linha 86). Ou seja: o
// revisor entra e vê o painel cheio, e nenhum cliente real esbarra numa
// "Barbearia Demonstração" no meio das barbearias de verdade.
//
// USO
//   node deploy/conta-revisor-apple.js              # cria e sorteia a senha
//   node deploy/conta-revisor-apple.js --senha=XXX  # cria com a senha dada
//   node deploy/conta-revisor-apple.js --remover    # apaga tudo (cascata)
//
// É idempotente: rodar de novo repõe os dados sem duplicar a barbearia.
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');
const { registrarEntradaAgendamento } = require('../src/services/caixa');

const SLUG = 'demo';
const EMAIL = 'revisor@cortavo.com.br';

const args = process.argv.slice(2);
const REMOVER = args.includes('--remover');
const senhaArg = (args.find((a) => a.startsWith('--senha=')) || '').slice('--senha='.length);

// Sem ambiguidade visual: sem O/0 nem I/l/1. O revisor DIGITA isso à mão num
// iPhone, e um "l" que na verdade era "1" vira rejeição por "não consegui
// entrar" — mais um ciclo de revisão perdido por um caractere.
function sortearSenha() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(14);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

// Dia às 00:00 no fuso do servidor, deslocado de `offset` dias.
function dia(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

// Momento da conclusão: o próprio dia do atendimento, no horário marcado.
// Os relatórios contam faturamento por `concluidoEm` — deixar tudo no
// instante de agora jogaria o histórico inteiro no dia de hoje, e o gráfico
// dos últimos dias sairia achatado num pico só.
function instante(data, hora) {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(data);
  d.setHours(h, m, 0, 0);
  return d;
}

async function remover() {
  const b = await prisma.barbearia.findUnique({ where: { slug: SLUG } });
  if (!b) {
    console.log('Nada a remover: não existe barbearia com slug "' + SLUG + '".');
    return;
  }
  // onDelete: Cascade nas relações de Barbearia leva junto usuários,
  // agendamentos, caixa, clientes e estoque.
  await prisma.barbearia.delete({ where: { id: b.id } });
  console.log('Removida a barbearia "' + b.nome + '" (id ' + b.id + ') e tudo que dependia dela.');
}

async function criar() {
  const senha = senhaArg || sortearSenha();

  const barbearia = await prisma.barbearia.upsert({
    where: { slug: SLUG },
    update: { ativo: false },
    create: {
      nome: 'Barbearia Demonstração',
      slug: SLUG,
      ativo: false,
      endereco: 'Rua das Tesouras, 100 — Centro',
    },
  });
  const bid = barbearia.id;

  // Zera o conteúdo antes de repovoar: rodar duas vezes não pode empilhar
  // agendamento em cima de agendamento.
  await prisma.caixa.deleteMany({ where: { barbeariaId: bid } });
  await prisma.agendamento.deleteMany({ where: { barbeariaId: bid } });
  await prisma.cliente.deleteMany({ where: { barbeariaId: bid } });
  await prisma.servico.deleteMany({ where: { barbeariaId: bid } });
  await prisma.estoque.deleteMany({ where: { barbeariaId: bid } });

  const senhaHash = bcrypt.hashSync(senha, 10);
  const revisor = await prisma.usuario.upsert({
    where: { barbeariaId_email: { barbeariaId: bid, email: EMAIL } },
    update: { senhaHash, ativo: true, papel: 'admin' },
    create: { barbeariaId: bid, nome: 'App Review', email: EMAIL, senhaHash, papel: 'admin' },
  });

  // Um segundo barbeiro: sem ele a tela de Equipe fica com uma linha só e a
  // agenda não mostra a troca entre profissionais, que é metade do app.
  const carlos = await prisma.usuario.upsert({
    where: { barbeariaId_email: { barbeariaId: bid, email: 'carlos@demo.cortavo.com.br' } },
    update: { ativo: true },
    create: {
      barbeariaId: bid,
      nome: 'Carlos Menezes',
      email: 'carlos@demo.cortavo.com.br',
      senhaHash: bcrypt.hashSync(sortearSenha(), 10),
      papel: 'funcionario',
      comissaoPercentual: 50,
    },
  });

  for (const u of [revisor, carlos]) {
    const jaTem = await prisma.horarioTrabalho.count({ where: { usuarioId: u.id } });
    if (jaTem) continue;
    for (let d = 0; d <= 6; d++) {
      await prisma.horarioTrabalho.create({
        data: {
          barbeariaId: bid,
          usuarioId: u.id,
          diaSemana: d,
          horaInicio: '09:00',
          horaFim: '20:00',
          trabalha: d !== 0,
        },
      });
    }
  }

  const catServExistente = await prisma.categoriaServico.findFirst({
    where: { barbeariaId: bid, nome: 'Cabelo e barba' },
  });
  const catServ =
    catServExistente ||
    (await prisma.categoriaServico.create({ data: { barbeariaId: bid, nome: 'Cabelo e barba' } }));

  const catalogo = [
    ['Corte social', 4500, 40, false, 'Máquina e tesoura, com acabamento na navalha.'],
    ['Barba completa', 3500, 30, false, 'Toalha quente, navalha e hidratação.'],
    ['Corte + barba', 7000, 60, false, 'O combo, com desconto.'],
    ['Pezinho', 2000, 15, false, 'Acabamento rápido entre um corte e outro.'],
    ['Pomada modeladora', 4000, 0, true, null],
    ['Shampoo anticaspa', 5500, 0, true, null],
  ];
  const servicos = {};
  for (const [nome, valor, duracaoMin, ehProduto, descricao] of catalogo) {
    servicos[nome] = await prisma.servico.create({
      data: {
        barbeariaId: bid,
        nome,
        valor,
        duracaoMin: duracaoMin || 30,
        ehProduto,
        descricao,
        categoriaId: ehProduto ? null : catServ.id,
        comissaoPercentual: ehProduto ? 10 : 50,
      },
    });
  }

  const nomesClientes = [
    ['Rafael Duarte', '11987650001'],
    ['Tiago Moreira', '11987650002'],
    ['Vinícius Prado', '11987650003'],
    ['Otávio Bastos', '11987650004'],
    ['Henrique Sales', '11987650005'],
    ['Murilo Antunes', '11987650006'],
  ];
  const clientes = [];
  for (const [nome, telefone] of nomesClientes) {
    clientes.push(await prisma.cliente.create({ data: { barbeariaId: bid, nome, telefone } }));
  }

  // Um item abaixo do mínimo, de propósito: é o que faz o alerta de estoque
  // aparecer na Home. Tela vazia é exatamente o que a Apple chama de
  // "conteúdo insuficiente".
  const catEstExistente = await prisma.categoriaEstoque.findFirst({
    where: { barbeariaId: bid, nome: 'Insumos' },
  });
  const catEst =
    catEstExistente ||
    (await prisma.categoriaEstoque.create({ data: { barbeariaId: bid, nome: 'Insumos' } }));
  await prisma.estoque.createMany({
    data: [
      { barbeariaId: bid, nome: 'Lâmina de barbear (cx. 100)', categoriaId: catEst.id, quantidade: 12, quantidadeMinima: 5, valorGasto: 8900 },
      { barbeariaId: bid, nome: 'Toalha descartável', categoriaId: catEst.id, quantidade: 2, quantidadeMinima: 10, valorGasto: 4500 },
      { barbeariaId: bid, nome: 'Talco', categoriaId: catEst.id, quantidade: 7, quantidadeMinima: 3, valorGasto: 1900 },
    ],
  });

  // [dias atrás, hora, índice do cliente, itens, forma de pagamento]
  const historico = [
    [13, '09:00', 0, ['Corte social'], 'pix'],
    [12, '10:30', 1, ['Corte + barba'], 'credito'],
    [11, '14:00', 2, ['Corte social', 'Pomada modeladora'], 'dinheiro'],
    [9, '11:00', 3, ['Barba completa'], 'debito'],
    [8, '16:00', 4, ['Corte + barba', 'Shampoo anticaspa'], 'credito'],
    [6, '09:30', 5, ['Pezinho'], 'dinheiro'],
    [5, '15:00', 0, ['Corte social'], 'pix'],
    [3, '10:00', 2, ['Corte + barba'], 'pix'],
    [2, '17:30', 1, ['Barba completa', 'Pomada modeladora'], 'credito'],
    [1, '13:00', 3, ['Corte social'], 'debito'],
  ];

  let faturado = 0;
  for (const [atras, hora, iCliente, nomesItens, forma] of historico) {
    const data = dia(-atras);
    const cliente = clientes[iCliente];
    const itens = nomesItens.map((n) => servicos[n]);
    const total = itens.reduce((s, it) => s + it.valor, 0);
    faturado += total;

    const ag = await prisma.agendamento.create({
      data: {
        barbeariaId: bid,
        usuarioId: carlos.id,
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        clienteTelefone: cliente.telefone,
        data,
        horaInicio: hora,
        status: 'concluido',
        concluidoEm: instante(data, hora),
        valorTotal: total,
        formaPagamento: forma,
        itens: { create: itens.map((it) => ({ servicoId: it.id, valorUnitario: it.valor, quantidade: 1 })) },
      },
    });

    await prisma.pagamentoAgendamento.create({
      data: {
        barbeariaId: bid,
        agendamentoId: ag.id,
        valor: total,
        formaPagamento: forma,
        parcelas: forma === 'credito' ? 2 : 1,
      },
    });

    // Passa pelo serviço de verdade em vez de um INSERT à mão: assim o caixa
    // da demo nasce exatamente como o de uma barbearia real (uma linha por
    // forma de pagamento), e o relatório "por forma" sai coerente.
    await registrarEntradaAgendamento(ag);
  }

  // Agenda à frente: sem isso o revisor abre o app num dia vazio.
  const futuros = [
    [0, '15:00', 4, ['Corte social']],
    [0, '16:30', 5, ['Corte + barba']],
    [1, '09:00', 0, ['Barba completa']],
    [1, '11:30', 2, ['Corte social']],
    [2, '14:00', 3, ['Corte + barba']],
  ];
  for (const [frente, hora, iCliente, nomesItens] of futuros) {
    const cliente = clientes[iCliente];
    const itens = nomesItens.map((n) => servicos[n]);
    await prisma.agendamento.create({
      data: {
        barbeariaId: bid,
        usuarioId: carlos.id,
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        clienteTelefone: cliente.telefone,
        data: dia(frente),
        horaInicio: hora,
        status: 'agendado',
        valorTotal: itens.reduce((s, it) => s + it.valor, 0),
        itens: { create: itens.map((it) => ({ servicoId: it.id, valorUnitario: it.valor, quantidade: 1 })) },
      },
    });
  }

  const real = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
  console.log('');
  console.log('  Barbearia .. ' + barbearia.nome + '  (slug "' + SLUG + '", oculta do app do cliente)');
  console.log(
    '  Conteúdo ... ' + historico.length + ' atendimentos concluídos (' + real(faturado) + '), ' +
      futuros.length + ' agendados, ' + clientes.length + ' clientes, ' +
      Object.keys(servicos).length + ' itens no catálogo'
  );
  console.log('');
  console.log('  ---- copie isto para o campo "Sign-In Information" ----');
  console.log('  E-mail .. ' + EMAIL);
  console.log('  Senha ... ' + senha);
  console.log('  -------------------------------------------------------');
  console.log('');
  if (!senhaArg) {
    console.log('  A senha foi sorteada agora e NÃO fica gravada em lugar nenhum. Anote antes de fechar.');
    console.log('');
  }
}

(REMOVER ? remover() : criar())
  .catch((e) => {
    console.error('Falhou:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
