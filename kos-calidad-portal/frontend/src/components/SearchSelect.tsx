import { useMemo, useState } from 'react'
import { matchKeywords } from '../lib/fuzzy'

export type SearchItem = { id: number; label: string }

// Combobox genérico con búsqueda por palabras clave (igual que el de producto).
export default function SearchSelect({
  items,
  value,
  onChange,
  placeholder = 'Buscar…',
}: {
  items: SearchItem[]
  value?: number
  onChange: (id: number) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = items.find((i) => i.id === value)

  const matches = useMemo(
    () => items.filter((i) => matchKeywords(query, i.label)).slice(0, 40),
    [query, items],
  )

  return (
    <div className="combo">
      <input
        type="text"
        placeholder={placeholder}
        value={open ? query : selected ? selected.label : query}
        onFocus={() => { setOpen(true); setQuery('') }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && (
        <div className="combo-list">
          {matches.length === 0 && <div className="combo-empty">Sin coincidencias</div>}
          {matches.map((i) => (
            <button
              type="button"
              key={i.id}
              className={'combo-item' + (i.id === value ? ' sel' : '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(i.id); setOpen(false); setQuery('') }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
