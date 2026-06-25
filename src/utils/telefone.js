// Utilitários de telefone.
// A unicidade do cliente é sempre sobre o número NORMALIZADO (só dígitos),
// para que "(51) 99999-9999" e "51999999999" sejam o mesmo número.

// Remove tudo que não for dígito (parênteses, traços, espaços, "+").
function normalizarTelefone(valor) {
  return (valor || '').replace(/\D/g, '');
}

// Formata para exibição amigável. Cai no número cru se não tiver 10/11 dígitos.
function formatarTelefone(valor) {
  const d = normalizarTelefone(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor || '';
}

module.exports = { normalizarTelefone, formatarTelefone };
