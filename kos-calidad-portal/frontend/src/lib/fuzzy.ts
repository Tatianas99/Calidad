const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

export function normalize(s: string): string {
  return (s ?? '').toString().toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

// Coincide si cada palabra de la búsqueda comparte prefijo (en cualquier
// sentido) con alguna palabra del texto. Así funcionan tanto abreviaturas como
// palabras completas: "cont 7" y "contenedor 7 oz" encuentran "CONT 7 OZ", y
// "vas 7 lo" encuentra "Vaso 7 oz LOLITA".
export function matchKeywords(query: string, texto: string): boolean {
  const q = normalize(query).trim()
  if (!q) return true
  const qTokens = q.split(/\s+/)
  const tTokens = normalize(texto).split(/\s+/)
  return qTokens.every((qt) => tTokens.some((tt) => tt.startsWith(qt) || qt.startsWith(tt)))
}
