import { useMemo, useState } from 'react'
import type { Referencia } from '../lib/types'
import { matchKeywords } from '../lib/fuzzy'

const textoDe = (r: Referencia) => `${r.codigo} ${r.descripcion ?? ''}`.trim()
const etiqueta = (r: Referencia) => (r.descripcion ? `${r.codigo} · ${r.descripcion}` : r.codigo)

export default function ReferenceSearch({
  referencias,
  value,
  onChange,
  freeText,
  onFreeText,
}: {
  referencias: Referencia[]
  value?: number
  onChange: (id: number) => void
  // Texto libre: permite escribir una referencia que NO está en la lista y
  // dejarla válida. Si no se pasan, el buscador funciona solo con la lista.
  freeText?: string
  onFreeText?: (text: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = referencias.find((r) => r.id === value)

  const matches = useMemo(
    () => referencias.filter((r) => matchKeywords(query, textoDe(r))).slice(0, 30),
    [query, referencias],
  )

  const q = query.trim()
  const permiteLibre = !!onFreeText && q.length > 0
  const usarLibre = () => {
    if (!onFreeText || !q) return
    onFreeText(q)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="combo">
      <input
        type="text"
        placeholder="Buscar o escribir referencia (ej: vas 7 lo)"
        value={open ? query : selected ? etiqueta(selected) : (freeText ?? '')}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onBlur={() => window.setTimeout(() => {
          // Si dejaron texto escrito que no eligieron de la lista, se acepta tal cual.
          if (query.trim()) usarLibre()
          setOpen(false)
        }, 150)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && permiteLibre) { e.preventDefault(); usarLibre() }
        }}
      />
      {open && (
        <div className="combo-list">
          {permiteLibre && (
            <button
              type="button"
              className="combo-item combo-libre"
              onMouseDown={(e) => e.preventDefault()}
              onClick={usarLibre}
            >
              ✎ Usar “{q}” (escribir referencia)
            </button>
          )}
          {matches.length === 0 && !permiteLibre && <div className="combo-empty">Sin coincidencias</div>}
          {matches.map((r) => (
            <button
              type="button"
              key={r.id}
              className={'combo-item' + (r.id === value ? ' sel' : '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(r.id)
                setOpen(false)
                setQuery('')
              }}
            >
              {etiqueta(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
