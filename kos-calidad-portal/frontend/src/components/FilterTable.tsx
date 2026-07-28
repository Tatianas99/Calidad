import { useMemo, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react'
import { matchKeywords } from '../lib/fuzzy'

export type Col<T> = {
  key: string
  label: string
  value: (row: T) => string        // texto para filtrar/mostrar
  render?: (row: T) => ReactNode    // opcional: contenido personalizado
  noFilter?: boolean                // oculta el botón de filtro (p. ej. columna de acciones)
}

const VACIO = '(vacío)'

// Tabla con filtro por columna estilo Excel: cada columna abre un panel con
// buscador por palabras clave + lista de valores con casillas.
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
  const [checked, setChecked] = useState<Record<string, Set<string>>>({})
  const [search, setSearch] = useState<Record<string, string>>({})
  const [openCol, setOpenCol] = useState<string | null>(null)
  const [pop, setPop] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [openDetail, setOpenDetail] = useState<string | null>(null)

  const valueOf = (c: Col<T>, r: T) => c.value(r) || VACIO

  const distinct = useMemo(() => {
    const d: Record<string, string[]> = {}
    for (const c of columns) {
      const s = new Set<string>()
      for (const r of rows) s.add(valueOf(c, r))
      d[c.key] = Array.from(s).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    }
    return d
  }, [columns, rows])

  const filtered = useMemo(
    () => rows.filter((r) => columns.every((c) => !checked[c.key] || checked[c.key].has(valueOf(c, r)))),
    [rows, columns, checked],
  )

  const isChecked = (colKey: string, v: string) =>
    checked[colKey] ? checked[colKey].has(v) : true
  const isFiltered = (colKey: string) => !!checked[colKey]

  function toggleValue(colKey: string, v: string) {
    setChecked((prev) => {
      const all = distinct[colKey]
      const cur = new Set(prev[colKey] ?? all)
      if (cur.has(v)) cur.delete(v)
      else cur.add(v)
      const next = { ...prev }
      if (cur.size === all.length) delete next[colKey]
      else next[colKey] = cur
      return next
    })
  }
  function setAll(colKey: string, on: boolean) {
    setChecked((prev) => {
      const next = { ...prev }
      if (on) delete next[colKey]
      else next[colKey] = new Set<string>()
      return next
    })
  }

  function abrir(colKey: string, e: ReactMouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPop({ x: Math.min(rect.left, window.innerWidth - 260), y: rect.bottom + 4 })
    setOpenCol(openCol === colKey ? null : colKey)
  }

  const ncols = columns.length
  const detalleRow = openDetail != null ? rows.find((r) => getKey(r) === openDetail) : undefined

  return (
    <div className="table-wrap">
      <table className="ftable">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>
                <div className="th-head">
                  <span>{c.label}</span>
                  {!c.noFilter && (
                    <button
                      className={'filt-btn' + (isFiltered(c.key) ? ' on' : '')}
                      title="Filtrar"
                      onClick={(e) => abrir(c.key, e)}
                    >▾</button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={ncols} className="muted center" style={{ padding: 18 }}>Sin resultados.</td></tr>
          )}
          {filtered.map((r) => {
            const k = getKey(r)
            return (
              <tr key={k} className={renderDetail ? 'clickable' : ''} onClick={() => renderDetail && setOpenDetail(k)}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : c.value(r)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: '.82rem' }}>{filtered.length} de {rows.length} registro(s)</p>

      {openCol && (
        <>
          <div className="filt-backdrop" onClick={() => setOpenCol(null)} />
          <div className="filt-pop" style={{ left: pop.x, top: pop.y }}>
            <input
              className="filt-search"
              autoFocus
              placeholder="Buscar…"
              value={search[openCol] || ''}
              onChange={(e) => setSearch((s) => ({ ...s, [openCol]: e.target.value }))}
            />
            <div className="filt-actions">
              <button onClick={() => setAll(openCol, true)}>Todos</button>
              <button onClick={() => setAll(openCol, false)}>Ninguno</button>
            </div>
            <div className="filt-values">
              {distinct[openCol]
                .filter((v) => matchKeywords(search[openCol] || '', v))
                .map((v) => (
                  <label key={v} className="filt-val">
                    <input type="checkbox" checked={isChecked(openCol, v)} onChange={() => toggleValue(openCol, v)} />
                    <span>{v}</span>
                  </label>
                ))}
              {distinct[openCol].filter((v) => matchKeywords(search[openCol] || '', v)).length === 0 && (
                <div className="muted" style={{ padding: 6 }}>Sin coincidencias</div>
              )}
            </div>
            <button className="btn btn-primary" style={{ minHeight: 38 }} onClick={() => setOpenCol(null)}>Aceptar</button>
          </div>
        </>
      )}

      {renderDetail && detalleRow && (
        <div className="modal-backdrop" onClick={() => setOpenDetail(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" title="Cerrar" onClick={() => setOpenDetail(null)}>×</button>
            <div className="modal-body">{renderDetail(detalleRow)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
