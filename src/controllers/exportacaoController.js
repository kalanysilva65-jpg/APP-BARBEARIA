// Exportação manual dos dados da barbearia (só admin) — dois botões no Perfil.
//
//   GET /painel/exportar/dados.json    — cópia FIEL para restaurar.
//   GET /painel/exportar/relatorio.pdf — documento legível para ler/imprimir.
//
// Ambos são escopados por req.barbeariaId (ver exportacao.js). O PDF é montado
// em memória e mandado como download; o JSON é a coleta serializada.
const PDFDocument = require('pdfkit');
const { coletarDados, semSenhas } = require('../services/exportacao');

// ----- formatação (pt-BR) ------------------------------------------------
const real = (centavos) =>
  'R$ ' + ((Number(centavos) || 0) / 100).toFixed(2).replace('.', ',');

function dataHora(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`;
}
function dataCurta(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
}

// Nome de arquivo seguro a partir do nome da barbearia (sem acento nem espaço).
function slugArquivo(nome) {
  return String(nome || 'barbearia')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'barbearia';
}

// ----- JSON: cópia fiel --------------------------------------------------
async function json(req, res) {
  const dados = await coletarDados(req.barbeariaId);
  const pacote = {
    _formato: 'cortavo-backup',
    _versao: 1,
    _geradoEm: new Date().toISOString(),
    _barbeariaId: req.barbeariaId,
    ...dados,
  };
  const nome = `cortavo-backup-${slugArquivo(dados.barbearia && dados.barbearia.nome)}-${dataCurta(new Date()).replace(/\//g, '-')}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  // 2 espaços: o arquivo é para o dono guardar/abrir, legibilidade > tamanho.
  res.send(JSON.stringify(pacote, null, 2));
}

// ----- PDF: documento legível -------------------------------------------
async function pdf(req, res) {
  const dados = await coletarDados(req.barbeariaId);
  const nome = `cortavo-backup-${slugArquivo(dados.barbearia && dados.barbearia.nome)}-${dataCurta(new Date()).replace(/\//g, '-')}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.pipe(res);

  const COR_TINTA = '#111111';
  const COR_FRACA = '#666666';
  const COR_LINHA = '#e2e2e2';
  const ESQ = doc.page.margins.left;
  const DIR = doc.page.width - doc.page.margins.right;
  const LARG = DIR - ESQ;

  // Cabeçalho de seção. Antes de desenhar, garante espaço na página — senão o
  // título fica órfão no rodapé com a tabela começando na página seguinte.
  function secao(titulo, subtitulo) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.moveDown(0.8);
    doc.fillColor(COR_TINTA).font('Helvetica-Bold').fontSize(13).text(titulo);
    if (subtitulo) doc.fillColor(COR_FRACA).font('Helvetica').fontSize(8.5).text(subtitulo);
    doc.moveDown(0.3);
    doc.strokeColor(COR_LINHA).lineWidth(1).moveTo(ESQ, doc.y).lineTo(DIR, doc.y).stroke();
    doc.moveDown(0.4);
  }

  // Uma tabela genérica: colunas = [{ rot, larg, alin }], linhas = string[][].
  // Cuida da quebra de página repetindo o cabeçalho, e trunca texto que não
  // cabe na coluna (some, não vaza para cima da coluna vizinha).
  function tabela(colunas, linhas) {
    if (!linhas.length) {
      doc.fillColor(COR_FRACA).font('Helvetica-Oblique').fontSize(9).text('(vazio)');
      doc.font('Helvetica');
      return;
    }
    const ALT = 16;

    function cabecalho() {
      let x = ESQ;
      doc.fillColor(COR_FRACA).font('Helvetica-Bold').fontSize(8);
      colunas.forEach((c) => {
        doc.text(c.rot, x + 2, doc.y, { width: c.larg - 4, align: c.alin || 'left', lineBreak: false });
        x += c.larg;
      });
      doc.moveDown(0.2);
      doc.strokeColor(COR_LINHA).lineWidth(0.5).moveTo(ESQ, doc.y).lineTo(DIR, doc.y).stroke();
      doc.moveDown(0.15);
    }

    cabecalho();
    doc.font('Helvetica').fontSize(8.5).fillColor(COR_TINTA);

    linhas.forEach((linha) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - ALT) {
        doc.addPage();
        cabecalho();
        doc.font('Helvetica').fontSize(8.5).fillColor(COR_TINTA);
      }
      const y = doc.y;
      let x = ESQ;
      colunas.forEach((c, i) => {
        doc.text(String(linha[i] == null ? '' : linha[i]), x + 2, y, {
          width: c.larg - 4,
          align: c.alin || 'left',
          lineBreak: false,
          ellipsis: true,
        });
        x += c.larg;
      });
      doc.y = y + ALT;
    });
  }

  // ---- capa ----
  doc.fillColor(COR_TINTA).font('Helvetica-Bold').fontSize(22).text('Backup de dados');
  doc.fillColor(COR_TINTA).font('Helvetica-Bold').fontSize(14).text(dados.barbearia ? dados.barbearia.nome : 'Barbearia');
  doc.fillColor(COR_FRACA).font('Helvetica').fontSize(9);
  doc.text('Gerado em ' + dataHora(new Date()));
  if (dados.barbearia && dados.barbearia.endereco) doc.text(dados.barbearia.endereco);
  doc.moveDown(0.3);
  doc.fillColor(COR_FRACA).fontSize(8).text(
    'Este PDF é para leitura e arquivo. Para restaurar os dados em caso de perda, use o arquivo JSON (botão "Baixar dados").'
  );

  // ---- resumo (contagens) ----
  secao('Resumo');
  const totalConcluidos = dados.agendamentos.filter((a) => a.status === 'concluido');
  const faturamentoConcluidos = totalConcluidos.reduce((s, a) => s + (a.valorTotal || 0), 0);
  tabela(
    [{ rot: 'Item', larg: LARG * 0.6 }, { rot: 'Quantidade', larg: LARG * 0.4, alin: 'right' }],
    [
      ['Clientes cadastrados', String(dados.clientes.length)],
      ['Agendamentos (todos)', String(dados.agendamentos.length)],
      ['Atendimentos concluídos', String(totalConcluidos.length)],
      ['Faturamento dos concluídos', real(faturamentoConcluidos)],
      ['Serviços e produtos', String(dados.servicos.length)],
      ['Itens em estoque', String(dados.estoque.length)],
      ['Equipe', String(dados.usuarios.length)],
      ['Planos', String(dados.planos.length)],
      ['Lançamentos de caixa', String(dados.caixa.length)],
    ]
  );

  // ---- equipe ----
  secao('Equipe', semSenhas(dados.usuarios).length + ' pessoa(s)');
  tabela(
    [
      { rot: 'Nome', larg: LARG * 0.34 },
      { rot: 'E-mail', larg: LARG * 0.34 },
      { rot: 'Função', larg: LARG * 0.14 },
      { rot: 'Comissão', larg: LARG * 0.1, alin: 'right' },
      { rot: 'Ativo', larg: LARG * 0.08, alin: 'right' },
    ],
    semSenhas(dados.usuarios).map((u) => [
      u.nome,
      u.email,
      u.papel,
      (u.comissaoPercentual != null ? u.comissaoPercentual + '%' : '—'),
      u.ativo ? 'Sim' : 'Não',
    ])
  );

  // ---- clientes ----
  secao('Clientes', dados.clientes.length + ' cadastrado(s)');
  tabela(
    [
      { rot: 'Nome', larg: LARG * 0.42 },
      { rot: 'Telefone', larg: LARG * 0.28 },
      { rot: 'Selos', larg: LARG * 0.15, alin: 'right' },
      { rot: 'Cadastro', larg: LARG * 0.15, alin: 'right' },
    ],
    dados.clientes.map((c) => [c.nome, c.telefone, String(c.selosFidelidade || 0), dataCurta(c.criadoEm)])
  );

  // ---- serviços e produtos ----
  secao('Serviços e produtos', dados.servicos.length + ' item(ns)');
  tabela(
    [
      { rot: 'Nome', larg: LARG * 0.4 },
      { rot: 'Tipo', larg: LARG * 0.14 },
      { rot: 'Preço', larg: LARG * 0.16, alin: 'right' },
      { rot: 'Duração', larg: LARG * 0.15, alin: 'right' },
      { rot: 'Comissão', larg: LARG * 0.15, alin: 'right' },
    ],
    dados.servicos.map((s) => [
      s.nome,
      s.ehProduto ? 'Produto' : 'Serviço',
      real(s.valor),
      s.ehProduto ? '—' : (s.duracaoMin + ' min'),
      (s.comissaoPercentual != null ? s.comissaoPercentual + '%' : '—'),
    ])
  );

  // ---- estoque ----
  secao('Estoque', dados.estoque.length + ' item(ns)');
  tabela(
    [
      { rot: 'Item', larg: LARG * 0.5 },
      { rot: 'Quantidade', larg: LARG * 0.2, alin: 'right' },
      { rot: 'Mínimo', larg: LARG * 0.15, alin: 'right' },
      { rot: 'Custo', larg: LARG * 0.15, alin: 'right' },
    ],
    dados.estoque.map((e) => [e.nome, String(e.quantidade), String(e.quantidadeMinima), real(e.valorGasto)])
  );

  // ---- planos ----
  secao('Planos', dados.planos.length + ' plano(s)');
  tabela(
    [
      { rot: 'Nome', larg: LARG * 0.4 },
      { rot: 'Tipo', larg: LARG * 0.2 },
      { rot: 'Valor', larg: LARG * 0.2, alin: 'right' },
      { rot: 'Validade', larg: LARG * 0.2, alin: 'right' },
    ],
    dados.planos.map((p) => [
      p.nome,
      p.tipo === 'limitado' ? `Limitado (${p.usos || 0}x)` : 'Ilimitado',
      real(p.valor),
      p.validadeDias + ' dias',
    ])
  );

  // ---- agendamentos ----
  secao('Agendamentos', dados.agendamentos.length + ' registro(s)');
  const nomeBarbeiro = {};
  dados.usuarios.forEach((u) => { nomeBarbeiro[u.id] = (u.nome || '').split(' ')[0]; });
  tabela(
    [
      { rot: 'Data', larg: LARG * 0.13, alin: 'left' },
      { rot: 'Hora', larg: LARG * 0.08 },
      { rot: 'Cliente', larg: LARG * 0.27 },
      { rot: 'Barbeiro', larg: LARG * 0.16 },
      { rot: 'Status', larg: LARG * 0.14 },
      { rot: 'Valor', larg: LARG * 0.12, alin: 'right' },
      { rot: 'Pgto', larg: LARG * 0.1, alin: 'right' },
    ],
    dados.agendamentos.map((a) => [
      dataCurta(a.data),
      a.horaInicio || '—',
      a.clienteNome,
      nomeBarbeiro[a.usuarioId] || '—',
      a.status,
      real(a.valorTotal),
      (a.pagamentos && a.pagamentos.length
        ? a.pagamentos.map((p) => p.formaPagamento).join('+')
        : (a.formaPagamento || '—')),
    ])
  );

  // ---- caixa ----
  const entradas = dados.caixa.filter((c) => c.tipo === 'entrada').reduce((s, c) => s + c.valor, 0);
  const saidas = dados.caixa.filter((c) => c.tipo === 'saida').reduce((s, c) => s + c.valor, 0);
  secao('Caixa', `${dados.caixa.length} lançamento(s) · entradas ${real(entradas)} · saídas ${real(saidas)} · saldo ${real(entradas - saidas)}`);
  tabela(
    [
      { rot: 'Data', larg: LARG * 0.14 },
      { rot: 'Descrição', larg: LARG * 0.44 },
      { rot: 'Tipo', larg: LARG * 0.12 },
      { rot: 'Forma', larg: LARG * 0.15 },
      { rot: 'Valor', larg: LARG * 0.15, alin: 'right' },
    ],
    dados.caixa.map((c) => [
      dataCurta(c.data),
      c.descricao,
      c.tipo,
      c.formaPagamento || '—',
      (c.tipo === 'saida' ? '- ' : '') + real(c.valor),
    ])
  );

  // ---- rodapé com paginação (bufferPages permite voltar e numerar) ----
  const faixa = doc.bufferedPageRange();
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i);
    doc.fillColor(COR_FRACA).font('Helvetica').fontSize(7.5);
    doc.text(
      `Cortavo · ${dados.barbearia ? dados.barbearia.nome : ''} · página ${i + 1} de ${faixa.count}`,
      ESQ,
      doc.page.height - 28,
      { width: LARG, align: 'center' }
    );
  }

  doc.end();
}

module.exports = { json, pdf };
