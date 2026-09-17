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

// Variantes plausíveis do MESMO número, para casar telefones salvos em formatos
// diferentes (o WhatsApp manda com "55" e às vezes SEM o 9 do celular; o cadastro
// manual costuma ser "(51) 99999-9999" -> sem "55"). Sem isso, comparar string
// exata falha e a IA "não acha" o agendamento do cliente. Gera: com/sem código do
// país e com/sem o 9º dígito do celular.
function variantesTelefone(valor) {
  const d = normalizarTelefone(valor);
  if (!d) return [];
  const set = new Set([d]);
  // Forma sem o código do país (55), quando presente.
  let semPais = d;
  if (d.startsWith('55') && d.length >= 12) semPais = d.slice(2);
  set.add(semPais);
  set.add('55' + semPais);
  // Alterna o 9 do celular sobre a forma DDD + número.
  if (semPais.length === 11 && semPais[2] === '9') {
    const sem9 = semPais.slice(0, 2) + semPais.slice(3); // remove o 9
    set.add(sem9);
    set.add('55' + sem9);
  } else if (semPais.length === 10) {
    const com9 = semPais.slice(0, 2) + '9' + semPais.slice(2); // adiciona o 9
    set.add(com9);
    set.add('55' + com9);
  }
  return Array.from(set).filter(Boolean);
}

// Forma CANÔNICA de um celular brasileiro: DDD + 9 + 8 dígitos (11 no total),
// SEM o código do país. É o formato em que o painel/app salvam. O WhatsApp manda
// com "55" e às vezes SEM o 9 do celular — aqui a gente conserta pra não criar
// cadastro duplicado. Se não parecer um celular BR, devolve os dígitos como estão.
function telefoneCanonicoBR(valor) {
  let d = normalizarTelefone(valor);
  if (!d) return '';
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2); // tira o país
  if (d.length === 10) d = d.slice(0, 2) + '9' + d.slice(2); // celular sem o 9 -> adiciona
  return d;
}

module.exports = { normalizarTelefone, formatarTelefone, variantesTelefone, telefoneCanonicoBR };
