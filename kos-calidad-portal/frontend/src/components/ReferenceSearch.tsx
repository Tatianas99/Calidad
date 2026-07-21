import { useMemo, useState } from 'react'
import type { Referencia } from '../lib/types'
import { matchKeywords } from '../lib/fuzzy'

const textoDe = (r: Referencia) => `${r.codigo} ${r.descripcion ?? ''}`.trim()
const etiqueta = (r: Referencia) => (r.descripcion ? `${r.codigo} · ${r.descripcion}` : r.codigo)

export default function ReferenceSearch({
  referencias,
  value,
  onChange,
}: {
  referencias: Referencia[]
  value?: number
  onChange: (id: number) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = referencias.find((r) => r.id === value)

  const matches = useMemo(
    () => referencias.filter((r) => matchKeywords(query, textoDe(r))).slice(0, 30),
    [query, referencias],
  )

  return (
    <div className="combo">
      <input
        type="text"
        placeholder="Buscar referencia (ej: vas 7 lo)"
        value={open ? query : selected ? etiqueta(selected) : query}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
      />
      {open && (
        <div className="combo-list">
          {matches.length === 0 && <div className="combo-empty">Sin coincidencias</div>}
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
