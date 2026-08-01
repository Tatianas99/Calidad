import { useMemo, useState } from 'react'
import { matchKeywords } from '../lib/fuzzy'

// Combo editable: permite BUSCAR por palabras clave en una lista de sugerencias
// y también ESCRIBIR un valor libre que no esté en la lista. El valor es texto.
export default function ComboBox({
  value, onChange, options, placeholder = 'Buscar o escribir…', max = 40,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  max?: number
}) {
  const [open, setOpen] = useState(false)
  const matches = useMemo(
    () => options.filter((o) => matchKeywords(value, o)).slice(0, max),
    [value, options, max],
  )

  return (
    <div className="combo">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
      />
      {open && matches.length > 0 && (
        <div className="combo-list">
          {matches.map((o) => (
            <button
              type="button"
              key={o}
              className={'combo-item' + (o === value ? ' sel' : '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o); setOpen(false) }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
