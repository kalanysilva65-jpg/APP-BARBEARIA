// Leitura da identidade visual (logo + selo "Powered by") de uma barbearia.
// A EDIÇÃO da marca fica no painel-mestre (dono do sistema), em
// /mestre/barbearias/:id — aqui só há a leitura, usada pelas views (server.js)
// para exibir o logo da barbearia do contexto.
const prisma = require('../config/db');

// Lê as duas configurações de marca de UMA barbearia.
// Retorna { logoUrl: string|null, mostrarPoweredBy: boolean }
async function lerMarca(barbeariaId) {
  if (!barbeariaId) return { logoUrl: null, mostrarPoweredBy: true };
  const registros = await prisma.configuracao.findMany({
    where: { barbeariaId, chave: { in: ['logo_url', 'mostrar_powered_by'] } },
  });
  const mapa = Object.fromEntries(registros.map((r) => [r.chave, r.valor]));
  return {
    logoUrl: mapa['logo_url'] || null,
    mostrarPoweredBy: mapa['mostrar_powered_by'] !== 'false', // padrão true
  };
}

module.exports = { lerMarca };
