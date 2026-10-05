// Leitura da identidade visual (logo + selo "Powered by") de uma barbearia.
// A EDIÇÃO da marca fica no painel-mestre (dono do sistema), em
// /mestre/barbearias/:id — aqui só há a leitura, usada pelas views (server.js)
// para exibir o logo da barbearia do contexto.
const prisma = require('../config/db');

// Lê as duas configurações de marca de UMA barbearia.
// Retorna { logoUrl: string|null, mostrarPoweredBy: boolean }
async function lerMarca(barbeariaId) {
  if (!barbeariaId) return { logoUrl: null, mostrarPoweredBy: true, logoAlinhamento: 'centro', logoTamanho: 168 };
  const registros = await prisma.configuracao.findMany({
    where: { barbeariaId, chave: { in: ['logo_url', 'mostrar_powered_by', 'logo_alinhamento', 'logo_tamanho'] } },
  });
  const mapa = Object.fromEntries(registros.map((r) => [r.chave, r.valor]));
  return {
    logoUrl: mapa['logo_url'] || null,
    mostrarPoweredBy: mapa['mostrar_powered_by'] !== 'false', // padrão true
    // Posição e tamanho da logo no agendamento público (editados pelo dono da barbearia).
    logoAlinhamento: ['esquerda', 'direita'].includes(mapa['logo_alinhamento']) ? mapa['logo_alinhamento'] : 'centro',
    logoTamanho: Math.min(240, Math.max(80, parseInt(mapa['logo_tamanho'], 10) || 168)),
  };
}

module.exports = { lerMarca };
