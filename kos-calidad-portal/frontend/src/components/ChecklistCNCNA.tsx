import type { Option } from '../lib/types'

// Checklist con botones grandes C / NC / N/A por ítem (optimizado para tablet).
export default function ChecklistCNCNA({
  items,
  resultados,
  value,
  onChange,
}: {
  items: Option[]
  resultados: string[]
  value: Record<string, string>
  onChange: (item: string, resultado: string) => void
}) {
  const cls = (r: string) =>
    r === 'C' ? 'sel-C' : r === 'NC' ? 'sel-NC' : 'sel-NA'

  return (
    <div>
      {items.map((it) => (
        <div className="check-row" key={it.value}>
          <span className="label">{it.label}</span>
          <div className="opts">
            {resultados.map((r) => {
              const selected = value[it.value] === r
              return (
                <button
                  type="button"
                  key={r}
                  className={'opt' + (selected ? ' ' + cls(r) : '')}
                  onClick={() => onChange(it.value, r)}
                  aria-pressed={selected}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
