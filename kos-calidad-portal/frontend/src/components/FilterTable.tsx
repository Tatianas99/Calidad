import { useMemo, useState, type ReactNode } from 'react'
import { matchKeywords } from '../lib/fuzzy'

export type Col<T> = {
  key: string
  label: string
  value: (row: T) => string        // texto para filtrar/mostrar
  render?: (row: T) => ReactNode    // opcional: contenido personalizado
}

// Tabla con un filtro por palabras clave en CADA columna (estilo buscador de producto).
export default function FilterTable<T>({
  columns,
  rows,
  getKey,
  renderDetail,
}: {
  columns: Col<T>[]
  rows: T[]
  getKey: (row: T) => string
  renderDetail?: (row: T) => ReactNode
}) {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [openKey, setOpenKey] = useState<string | null>(null)

  const filtered = useMemo(
    () => rows.filter((r) => columns.every((c) => matchKeywords(filters[c.key] || '', c.value(r)))),
    [rows, columns, filters],
  )

  return (
    <div className="table-wrap">
      <table className="ftable">
        <thead>
          <tr>
            {renderDetail && <th style={{ width: 34 }} />}
            {columns.map((c) => <th key={c.key}>{c.label}</th>)}
          </tr>
          <tr className="filter-row">
            {renderDetail && <th />}
            {columns.map((c) => (
              <th key={c.key}>
                <input
                  placeholder="filtrar…"
                  value={filters[c.key] || ''}
                  onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={columns.length + (renderDetail ? 1 : 0)} className="muted center" style={{ padding: 18 }}>Sin resultados.</td></tr>
          )}
          {filtered.map((r) => {
            const k = getKey(r)
            const abierto = openKey === k
            return (
              <Frag key={k}>
                <tr className={renderDetail ? 'clickable' : ''} onClick={() => renderDetail && setOpenKey(abierto ? null : k)}>
                  {renderDetail && <td className="center">{abierto ? '▾' : '▸'}</td>}
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : c.value(r)}</td>)}
                </tr>
                {renderDetail && abierto && (
                  <tr className="detail-row">
                    <td colSpan={columns.length + 1}>{renderDetail(r)}</td>
                  </tr>
                )}
              </Frag>
            )
          })}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: '.82rem' }}>{filtered.length} de {rows.length} registro(s)</p>
    </div>
  )
}

// Fragmento con key (evita warnings al envolver dos <tr>)
function Frag({ children }: { children: ReactNode }) {
  return <>{children}</>
}
