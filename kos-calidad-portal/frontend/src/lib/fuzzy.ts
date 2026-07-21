const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

export function normalize(s: string): string {
  return (s ?? '').toString().toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

// Coincide si cada palabra de la búsqueda es prefijo de alguna palabra del texto.
// Ej: "vas 7 lo" coincide con "Vaso 7 oz LOLITA".
export function matchKeywords(query: string, texto: string): boolean {
  const q = normalize(query).trim()
  if (!q) return true
  const qTokens = q.split(/\s+/)
  const tTokens = normalize(texto).split(/\s+/)
  return qTokens.every((qt) => tTokens.some((tt) => tt.startsWith(qt)))
}
