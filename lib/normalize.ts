/**
 * Normaliza nomes para comparação robusta entre planilhas e anotações.
 * Remove acentos, lowercase, colapsa espaços.
 * Ex: "João da Silva  " → "joao da silva"
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Match exato (após normalização).
 */
export function namesEqual(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/**
 * Resolve um nome (tipicamente vindo de anotação livre) contra uma lista de
 * candidatos (tipicamente a folha). Retorna o candidato equivalente ou null.
 *
 * Estratégia em camadas, da mais estrita para a mais permissiva:
 *   1. Match exato após normalização.
 *   2. Match por substring (tokens do nome mais curto contidos no mais longo).
 *      Ex: "Maria dos Santos" casa com "Maria dos Santos Silva".
 *   3. Match por primeiro nome único: se "Maria" aparece em exatamente um
 *      candidato ("Maria X"), bate. Se houver múltiplos → null (ambíguo → órfão).
 *
 * A camada 3 é o ponto de risco: pode produzir falsos positivos se houver
 * homônimos. Por isso só aceita quando há EXATAMENTE 1 candidato com o mesmo
 * primeiro nome. Ambíguo é tratado como órfão na camada de aplicação (UI alerta).
 */
export function resolveName<T extends { nome: string }>(
  query: string,
  candidatos: T[],
): T | null {
  const nq = normalizeName(query);
  if (!nq) return null;

  // 1. Exato
  const exato = candidatos.find((c) => normalizeName(c.nome) === nq);
  if (exato) return exato;

  // 2. Substring (o menor contido no maior, tokenizado)
  const tokensQ = nq.split(" ");
  const porSubstring = candidatos.filter((c) => {
    const nc = normalizeName(c.nome);
    const tokensC = nc.split(" ");
    if (tokensQ.length >= 2 && tokensC.length >= 2) {
      const menor = tokensQ.length <= tokensC.length ? nq : nc;
      const maior = tokensQ.length <= tokensC.length ? nc : nq;
      return maior.includes(menor);
    }
    return false;
  });
  if (porSubstring.length === 1) return porSubstring[0];
  if (porSubstring.length > 1) return null; // ambíguo

  // 3. Primeiro nome único
  const primeiro = tokensQ[0];
  const porPrimeiroNome = candidatos.filter(
    (c) => normalizeName(c.nome).split(" ")[0] === primeiro,
  );
  if (porPrimeiroNome.length === 1) return porPrimeiroNome[0];

  return null;
}

