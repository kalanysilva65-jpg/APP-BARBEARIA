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
//   node deploy/conta-revisor-apple.js              # repõe os dados; MANTÉM a senha atual
//   node deploy/conta-revisor-apple.js --senha=XXX  # (re)define a senha do revisor
//   node deploy/conta-revisor-apple.js --remover    # apaga tudo (cascata)
//
// É idempotente: rodar de novo repõe os dados sem duplicar a barbearia. Sem
// --senha, a senha do revisor é PRESERVADA — re-rodar só pra atualizar os dados
// não muda o login que está no formulário de revisão (trocar quebraria uma
// revisão em andamento). Popula ~1 mês de atendimentos na barbearia demo.
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
  // Os atendimentos de HOJE usam horas da manhã. Rodando o script às 7h, um
  // "concluído às 09:00" ficaria no futuro — atendimento fechado que ainda não
  // aconteceu. Trava no instante atual.
  const agora = new Date();
  return d > agora ? agora : d;
}

async function remover() {
  const b = await prisma.barbearia.findUnique({ where: { slug: SLUG } });
  if (!b) {
    console.log('Nada a remover: não existe barbearia com slug "' + SLUG + '".');
    return;
  }
  // Apaga os agendamentos ANTES: a relação Agendamento->Usuario é Restrict de
  // propósito (não perder histórico se um barbeiro sai), então o cascade da
  // barbearia falharia ao remover os usuários enquanto agendamentos os
  // referenciam. Removidos os agendamentos (com itens/pagamentos em cascata),
  // o resto (usuários, caixa, clientes, serviços, estoque, metas) sai pelo
  // cascade da barbearia.
  await prisma.agendamento.deleteMany({ where: { barbeariaId: b.id } });
  await prisma.barbearia.delete({ where: { id: b.id } });
  console.log('Removida a barbearia "' + b.nome + '" (id ' + b.id + ') e tudo que dependia dela.');
}

async function criar() {
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

  // Zera o conteúdo antes de repovoar: rodar duas vezes não pode empilhar dados.
  // Ordem importa por causa das FKs (ex.: ClientePlano->Plano é Restrict; caixa
  // referencia agendamento/categoria). NÃO apaga usuários (o revisor sobrevive).
  await prisma.caixa.deleteMany({ where: { barbeariaId: bid } });
  await prisma.clientePlano.deleteMany({ where: { barbeariaId: bid } });
  await prisma.fidelidadeResgate.deleteMany({ where: { barbeariaId: bid } });
  await prisma.plano.deleteMany({ where: { barbeariaId: bid } });
  await prisma.cupom.deleteMany({ where: { barbeariaId: bid } });
  await prisma.meta.deleteMany({ where: { barbeariaId: bid } });
  await prisma.servicoInsumo.deleteMany({ where: { barbeariaId: bid } });
  await prisma.agendamento.deleteMany({ where: { barbeariaId: bid } });
  await prisma.cliente.deleteMany({ where: { barbeariaId: bid } });
  await prisma.servico.deleteMany({ where: { barbeariaId: bid } });
  await prisma.estoque.deleteMany({ where: { barbeariaId: bid } });
  await prisma.categoriaCaixa.deleteMany({ where: { barbeariaId: bid } });

  // Senha: PRESERVA a atual quando o revisor já existe e nenhuma --senha veio.
  // Re-rodar só pra atualizar os DADOS não pode trocar o login que está no
  // formulário de revisão — trocaria e quebraria uma revisão em andamento.
  // (Os deleteMany acima não apagam usuários, então o revisor sobrevive.)
  const revisorExistente = await prisma.usuario.findUnique({
    where: { barbeariaId_email: { barbeariaId: bid, email: EMAIL } },
  });
  const preservarSenha = !!revisorExistente && !senhaArg;
  const senha = preservarSenha ? null : senhaArg || sortearSenha();
  const revisor = await prisma.usuario.upsert({
    where: { barbeariaId_email: { barbeariaId: bid, email: EMAIL } },
    update: preservarSenha
      ? { ativo: true, papel: 'admin' }
      : { ativo: true, papel: 'admin', senhaHash: bcrypt.hashSync(senha, 10) },
    create: { barbeariaId: bid, nome: 'App Review', email: EMAIL, senhaHash: bcrypt.hashSync(senha || sortearSenha(), 10), papel: 'admin' },
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
    ['Sobrancelha', 1500, 10, false, 'Design e limpeza na navalha.'],
    ['Hidratação capilar', 3000, 20, false, 'Máscara e hidratação profunda.'],
    ['Pomada modeladora', 4000, 0, true, null],
    ['Shampoo anticaspa', 5500, 0, true, null],
    ['Óleo para barba', 3800, 0, true, null],
    ['Cera modeladora', 4200, 0, true, null],
    ['Minoxidil 5%', 8900, 0, true, null],
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
    ['Bruno Farias', '11987650007'],
    ['Diego Lemos', '11987650008'],
    ['Felipe Ramos', '11987650009'],
    ['Gustavo Pinto', '11987650010'],
    ['Leandro Cruz', '11987650011'],
    ['Marcelo Vidal', '11987650012'],
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

  // ~1 MÊS de atendimentos, GERADO (pedido do dono, 2026-09-07): antes eram ~13
  // dias listados à mão; agora cobre 30 dias pra a demo parecer uma barbearia
  // em uso de verdade. Espalha entre os DOIS barbeiros, várias formas de
  // pagamento e serviços/combos — assim relatórios, comissões e "por forma"
  // saem cheios e coerentes.
  const barbeiros = [revisor, carlos];
  const horasDia = ['09:00', '09:30', '10:30', '11:00', '11:30', '14:00', '15:00', '16:00', '17:00', '18:00'];
  const combos = [
    ['Corte social'],
    ['Corte + barba'],
    ['Barba completa'],
    ['Pezinho'],
    ['Corte social', 'Pomada modeladora'],
    ['Corte + barba', 'Shampoo anticaspa'],
    ['Barba completa', 'Pomada modeladora'],
    ['Corte social'],
    ['Corte + barba'],
  ];
  const formas = ['pix', 'credito', 'dinheiro', 'debito', 'pix', 'credito'];

  // Pseudo-aleatório DETERMINÍSTICO: a mesma demo sai igual toda vez (sem
  // depender de Math.random), então re-rodar não muda o "jeito" da barbearia.
  let _seed = 20260907;
  const rnd = (n) => {
    _seed = (_seed * 9301 + 49297) % 233280;
    return Math.floor((_seed / 233280) * n);
  };

  const historico = [];
  for (let atras = 30; atras >= 1; atras--) {
    const d = dia(-atras);
    if (d.getDay() === 0) continue; // domingo é folga na jornada padrão
    const qtd = 2 + rnd(4); // 2 a 5 atendimentos por dia
    const horasUsadas = new Set();
    for (let k = 0; k < qtd; k++) {
      let hora;
      let tent = 0;
      do {
        hora = horasDia[rnd(horasDia.length)];
        tent++;
      } while (horasUsadas.has(hora) && tent < 12);
      horasUsadas.add(hora);
      historico.push({ atras, hora, iBarb: rnd(barbeiros.length), iCliente: rnd(clientes.length), itens: combos[rnd(combos.length)], forma: formas[rnd(formas.length)] });
    }
  }
  // HOJE (só manhã, pra não cair no futuro): a Home abre com "Faturamento hoje"
  // em destaque — sem atendimento concluído hoje ela mostraria R$ 0,00.
  historico.push({ atras: 0, hora: '09:00', iBarb: 0, iCliente: rnd(clientes.length), itens: ['Corte social'], forma: 'pix' });
  historico.push({ atras: 0, hora: '10:30', iBarb: 1, iCliente: rnd(clientes.length), itens: ['Corte + barba', 'Pomada modeladora'], forma: 'credito' });
  historico.push({ atras: 0, hora: '12:00', iBarb: 0, iCliente: rnd(clientes.length), itens: ['Pezinho'], forma: 'dinheiro' });

  let faturado = 0;
  for (const e of historico) {
    const data = dia(-e.atras);
    const cliente = clientes[e.iCliente];
    const barbeiro = barbeiros[e.iBarb];
    const itens = e.itens.map((n) => servicos[n]);
    const total = itens.reduce((s, it) => s + it.valor, 0);
    faturado += total;

    const ag = await prisma.agendamento.create({
      data: {
        barbeariaId: bid,
        usuarioId: barbeiro.id,
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        clienteTelefone: cliente.telefone,
        data,
        horaInicio: e.hora,
        status: 'concluido',
        concluidoEm: instante(data, e.hora),
        valorTotal: total,
        formaPagamento: e.forma,
        itens: { create: itens.map((it) => ({ servicoId: it.id, valorUnitario: it.valor, quantidade: 1 })) },
      },
    });

    await prisma.pagamentoAgendamento.create({
      data: { barbeariaId: bid, agendamentoId: ag.id, valor: total, formaPagamento: e.forma, parcelas: e.forma === 'credito' ? 2 : 1 },
    });

    // Passa pelo serviço de verdade (uma linha de caixa por forma), depois
    // corrige a DATA do caixa pro dia/hora do atendimento — senão o serviço
    // carimba "agora" e o mês inteiro cairia no dia em que o script rodou.
    await registrarEntradaAgendamento(ag);
    await prisma.caixa.updateMany({ where: { agendamentoId: ag.id }, data: { data: instante(data, e.hora) } });
  }

  // Agenda à frente: sem isso o revisor abre o app num dia vazio.
  // [dias à frente, hora, índice do cliente, itens, índice do barbeiro]
  const futuros = [
    [0, '15:00', 4, ['Corte social'], 0],
    [0, '16:30', 5, ['Corte + barba'], 1],
    [1, '09:00', 0, ['Barba completa'], 0],
    [1, '11:30', 2, ['Corte social'], 1],
    [1, '15:30', 6, ['Corte + barba'], 0],
    [2, '10:00', 7, ['Corte social'], 1],
    [2, '14:00', 3, ['Corte + barba'], 0],
    [3, '16:00', 8, ['Barba completa'], 1],
  ];
  for (const [frente, hora, iCliente, nomesItens, iBarb] of futuros) {
    const cliente = clientes[iCliente % clientes.length];
    const itens = nomesItens.map((n) => servicos[n]);
    await prisma.agendamento.create({
      data: {
        barbeariaId: bid,
        usuarioId: barbeiros[iBarb].id,
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

  // ---- Planos (assinaturas que a barbearia vende) ----
  const planosDefs = [
    // [nome, tipo, usos, validadeDias, valor(centavos), serviço coberto | null]
    ['Clube do Corte', 'limitado', 4, 30, 12000, 'Corte social'],
    ['Barba Ilimitada', 'ilimitado', null, 30, 9000, 'Barba completa'],
    ['VIP Corte + Barba', 'limitado', 4, 30, 20000, null],
  ];
  const planos = [];
  for (const [nome, tipo, usos, validadeDias, valor, svcNome] of planosDefs) {
    planos.push(
      await prisma.plano.create({
        data: { barbeariaId: bid, nome, tipo, usos, validadeDias, valor, servicoId: svcNome ? servicos[svcNome].id : null },
      })
    );
  }

  // ---- Assinantes (clientes com plano ativo) + entrada de caixa da venda ----
  const catPlanos = await prisma.categoriaCaixa.create({ data: { barbeariaId: bid, nome: 'Planos', tipo: 'entrada' } });
  const assinaturas = [
    [0, 0, -10],
    [1, 1, -6],
    [2, 0, -3],
    [3, 2, -1],
  ];
  for (const [iCli, iPlano, iniAtras] of assinaturas) {
    const cli = clientes[iCli];
    const plano = planos[iPlano];
    const dataInicio = dia(iniAtras);
    const dataFim = new Date(dataInicio);
    dataFim.setDate(dataFim.getDate() + plano.validadeDias);
    await prisma.clientePlano.create({
      data: {
        barbeariaId: bid,
        clienteId: cli.id,
        planoId: plano.id,
        dataInicio,
        dataFim,
        usosRestantes: plano.tipo === 'limitado' ? plano.usos : null,
      },
    });
    if (plano.valor > 0) {
      await prisma.caixa.create({
        data: {
          barbeariaId: bid,
          categoriaId: catPlanos.id,
          descricao: 'Plano ' + plano.nome + ' — ' + cli.nome,
          valor: plano.valor,
          tipo: 'entrada',
          formaPagamento: 'pix',
          data: instante(dataInicio, '10:00'),
        },
      });
    }
  }

  // ---- Saídas de caixa (despesas do mês) ----
  const catAluguel = await prisma.categoriaCaixa.create({ data: { barbeariaId: bid, nome: 'Aluguel', tipo: 'saida' } });
  const catInsumos = await prisma.categoriaCaixa.create({ data: { barbeariaId: bid, nome: 'Insumos e produtos', tipo: 'saida' } });
  const catContas = await prisma.categoriaCaixa.create({ data: { barbeariaId: bid, nome: 'Contas', tipo: 'saida' } });
  const saidas = [
    [28, catAluguel.id, 'Aluguel do ponto', 250000, '09:00'],
    [25, catInsumos.id, 'Compra de lâminas e toalhas', 42000, '11:00'],
    [20, catContas.id, 'Energia elétrica', 31000, '14:00'],
    [15, catInsumos.id, 'Reposição de pomadas', 28000, '16:00'],
    [10, catContas.id, 'Internet', 12000, '10:00'],
    [4, catInsumos.id, 'Compra de shampoos e óleos', 33000, '15:00'],
  ];
  for (const [atras, categoriaId, descricao, valor, hora] of saidas) {
    await prisma.caixa.create({
      data: { barbeariaId: bid, categoriaId, descricao, valor, tipo: 'saida', data: instante(dia(-atras), hora) },
    });
  }

  // ---- Fidelidade: cupons + resgates ----
  const em30 = new Date();
  em30.setDate(em30.getDate() + 30);
  const em60 = new Date();
  em60.setDate(em60.getDate() + 60);
  await prisma.cupom.createMany({
    data: [
      { barbeariaId: bid, nome: 'Aniversário', descricao: 'Desconto no mês do aniversário.', desconto: '20%', validade: em60 },
      { barbeariaId: bid, nome: 'Indique um amigo', descricao: 'Para quem trouxe um amigo novo.', desconto: 'R$15', validade: em30 },
      { barbeariaId: bid, nome: 'Combo do mês', descricao: 'Corte + barba com preço especial.', desconto: 'R$10', validade: em30 },
    ],
  });
  await prisma.fidelidadeResgate.createMany({
    data: [
      { barbeariaId: bid, clienteId: clientes[0].id, selosUsados: 10, data: dia(-18) },
      { barbeariaId: bid, clienteId: clientes[2].id, selosUsados: 10, data: dia(-9) },
      { barbeariaId: bid, clienteId: clientes[4].id, selosUsados: 10, data: dia(-2) },
    ],
  });

  // ---- Consumo de estoque (ficha técnica: serviço/produto baixa insumo) ----
  const estoqueRows = await prisma.estoque.findMany({ where: { barbeariaId: bid } });
  const estMap = Object.fromEntries(estoqueRows.map((e) => [e.nome, e]));
  async function ligaInsumo(svcNome, estNome, qtd) {
    const s = servicos[svcNome];
    const e = estMap[estNome];
    if (s && e) await prisma.servicoInsumo.create({ data: { barbeariaId: bid, servicoId: s.id, estoqueId: e.id, quantidade: qtd } });
  }
  await ligaInsumo('Barba completa', 'Lâmina de barbear (cx. 100)', 1);
  await ligaInsumo('Corte + barba', 'Lâmina de barbear (cx. 100)', 1);
  await ligaInsumo('Corte social', 'Toalha descartável', 1);

  // ---- Metas do mês (mostra a aba nova populada) ----
  await prisma.meta.createMany({
    data: [
      { barbeariaId: bid, usuarioId: null, metrica: 'faturamento', alvo: 800000 },
      { barbeariaId: bid, usuarioId: null, metrica: 'atendimentos', alvo: 120 },
      { barbeariaId: bid, usuarioId: null, metrica: 'novos_clientes', alvo: 15 },
      { barbeariaId: bid, usuarioId: carlos.id, metrica: 'faturamento', alvo: 400000 },
    ],
  });

  const real = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
  console.log('');
  console.log('  Barbearia .. ' + barbearia.nome + '  (slug "' + SLUG + '", oculta do app do cliente)');
  const nProdutos = Object.values(servicos).filter((s) => s.ehProduto).length;
  console.log(
    '  Conteúdo ... ' + historico.length + ' atendimentos concluídos em ~30 dias (' + real(faturado) + '), ' +
      futuros.length + ' agendados, ' + clientes.length + ' clientes'
  );
  console.log(
    '  Catálogo ... ' + (Object.keys(servicos).length - nProdutos) + ' serviços, ' + nProdutos + ' produtos, ' +
      planos.length + ' planos (' + assinaturas.length + ' assinantes), 3 cupons, ' + saidas.length + ' saídas no caixa, 4 metas'
  );
  console.log('');
  if (preservarSenha) {
    console.log('  Login do revisor: ' + EMAIL + '  (senha MANTIDA — a mesma que já estava)');
    console.log('');
  } else {
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
}

(REMOVER ? remover() : criar())
  .catch((e) => {
    console.error('Falhou:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
