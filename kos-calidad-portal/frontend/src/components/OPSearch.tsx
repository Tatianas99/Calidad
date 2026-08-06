import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api'

export type OP = { op: string; referencia: string; marca: string }

// Buscador de Orden de producción: consulta en vivo la tabla de OP (op_numeros)
// por número/referencia/marca. Al elegir una, se autollena la Referencia y la
// Marca (callback onResolve). También permite escribir una OP libre.
export default function OPSearch({
  value, onChange, onResolve, placeholder = 'Buscar OP por número…',
}: {
  value: string
  onChange: (v: string) => void
  onResolve: (op: OP) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<OP[]>([])
  const [cargando, setCargando] = useState(false)
  const debRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(debRef.current)
    const q = value.trim()
    if (!q) { setOpts([]); return }
    debRef.current = window.setTimeout(() => {
      setCargando(true)
      apiGet<OP[]>(`/catalogos/op?q=${encodeURIComponent(q)}`)
        .then((r) => setOpts(r))
        .catch(() => setOpts([]))
        .finally(() => setCargando(false))
    }, 300)
    return () => window.clearTimeout(debRef.current)
  }, [value])

  const elegir = (o: OP) => { onChange(o.op); onResolve(o); setOpen(false) }

  return (
    <div className="combo">
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
      />
      {open && value.trim() && (
        <div className="combo-list">
          {cargando && <div className="combo-item muted">Buscando…</div>}
          {!cargando && opts.length === 0 && <div className="combo-item muted">Sin coincidencias — puedes escribir la OP.</div>}
          {opts.map((o) => (
            <button
              type="button"
              key={o.op}
              className={'combo-item' + (o.op === value ? ' sel' : '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(o)}
            >
              <strong>OP {o.op}</strong> — {o.referencia}{o.marca ? ` · ${o.marca}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
