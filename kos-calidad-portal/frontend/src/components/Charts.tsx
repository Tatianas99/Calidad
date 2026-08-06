// Primitivas de gráficos del Dashboard (sin librerías externas).
// Regla de diseño: un solo tono por significado, valor directo en la marca,
// un solo eje, ejes/grilla discretos, tooltip nativo al pasar el mouse.

export type BarItem = { label: string; value: number; valueText?: string; sub?: string }

// Lista de barras horizontales (magnitud / ranking). `color` = tono de la marca.
export function BarList({ items, color = '#3b82f6', empty = 'Sin datos en el periodo.' }: {
  items: BarItem[]
  color?: string
  empty?: string
}) {
  if (!items.length) return <p className="muted" style={{ margin: '4px 0' }}>{empty}</p>
  const max = Math.max(...items.map((i) => i.value), 0) || 1
  return (
    <div className="barlist">
      {items.map((it, i) => (
        <div className="barrow" key={it.label + i} title={`${it.label}: ${it.valueText ?? it.value}${it.sub ? ` (${it.sub})` : ''}`}>
          <div className="barlabel">{it.label}</div>
          <div className="bartrack">
            <div className="barfill" style={{ width: `${Math.max((it.value / max) * 100, it.value > 0 ? 3 : 0)}%`, background: color }} />
          </div>
          <div className="barval">{it.valueText ?? it.value}</div>
        </div>
      ))}
    </div>
  )
}

// Gráfica de línea (tendencia de una sola serie) con banda de rango aceptable.
export function TrendLine({ serie, min, max, unidad = '' }: {
  serie: { t: string; v: number }[]
  min: number
  max: number
  unidad?: string
}) {
  if (!serie.length) return <p className="muted" style={{ margin: '4px 0' }}>Sin mediciones en el periodo.</p>
  const W = 600, H = 190, padL = 38, padR = 12, padT = 12, padB = 26
  const vals = serie.map((s) => s.v)
  let yMin = Math.min(min, ...vals), yMax = Math.max(max, ...vals)
  const pad = (yMax - yMin) * 0.12 || 0.5
  yMin -= pad; yMax += pad
  const x = (i: number) => padL + (serie.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (serie.length - 1))
  const y = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * (H - padT - padB)
  const path = serie.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(s.v).toFixed(1)}`).join(' ')
  const fmtT = (t: string) => new Date(t).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })

  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img">
      {/* banda de rango aceptable */}
      <rect x={padL} y={y(max)} width={W - padL - padR} height={Math.max(y(min) - y(max), 0)} className="trend-band" />
      <line x1={padL} x2={W - padR} y1={y(max)} y2={y(max)} className="trend-limit" />
      <line x1={padL} x2={W - padR} y1={y(min)} y2={y(min)} className="trend-limit" />
      <text x={padL - 4} y={y(max) + 3} className="trend-tick" textAnchor="end">{max}</text>
      <text x={padL - 4} y={y(min) + 3} className="trend-tick" textAnchor="end">{min}</text>
      {/* línea */}
      <path d={path} className="trend-line" fill="none" />
      {/* puntos (rojo si fuera de rango) */}
      {serie.map((s, i) => {
        const fuera = s.v < min || s.v > max
        return (
          <circle key={i} cx={x(i)} cy={y(s.v)} r={3.2} className={fuera ? 'trend-dot bad' : 'trend-dot'}>
            <title>{`${fmtT(s.t)} ${new Date(s.t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · ${s.v}${unidad}`}</title>
          </circle>
        )
      })}
      {/* fechas extremas */}
      <text x={padL} y={H - 8} className="trend-tick">{fmtT(serie[0].t)}</text>
      {serie.length > 1 && <text x={W - padR} y={H - 8} className="trend-tick" textAnchor="end">{fmtT(serie[serie.length - 1].t)}</text>}
    </svg>
  )
}

// Columnas verticales (magnitud por categoría ordinal, p. ej. por turno).
export function VBars({ items, color = 'var(--ch-1)' }: { items: BarItem[]; color?: string }) {
  if (!items.length) return <p className="muted" style={{ margin: '4px 0' }}>Sin datos en el periodo.</p>
  const max = Math.max(...items.map((i) => i.value), 0) || 1
  return (
    <div className="vbars">
      {items.map((it, i) => (
        <div className="vcol" key={it.label + i} title={`${it.label}: ${it.valueText ?? it.value}${it.sub ? ` (${it.sub})` : ''}`}>
          <div className="vval">{it.valueText ?? it.value}</div>
          <div className="vtrack"><div className="vfill" style={{ height: `${Math.max((it.value / max) * 100, it.value > 0 ? 4 : 0)}%`, background: color }} /></div>
          <div className="vlabel">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

// Línea genérica (serie de tiempo de una métrica: % NC, Clase B, liberaciones…).
export function LineMetric({ serie, suffix = '', color = 'var(--ch-1)' }: {
  serie: { fecha: string; v: number }[]
  suffix?: string
  color?: string
}) {
  if (!serie.length) return <p className="muted" style={{ margin: '4px 0' }}>Sin datos en el periodo.</p>
  const W = 600, H = 180, padL = 40, padR = 12, padT = 14, padB = 26
  const yMax = Math.max(...serie.map((s) => s.v), 0) * 1.15 || 1
  const x = (i: number) => padL + (serie.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (serie.length - 1))
  const y = (v: number) => padT + ((yMax - v) / yMax) * (H - padT - padB)
  const path = serie.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(s.v).toFixed(1)}`).join(' ')
  const fmtT = (t: string) => new Date(t + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={padL} x2={W - padR} y1={y(yMax)} y2={y(yMax)} className="lm-grid" />
      <text x={padL - 4} y={y(yMax) + 3} className="trend-tick" textAnchor="end">{Math.round(yMax)}{suffix}</text>
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="lm-axis" />
      <text x={padL - 4} y={y(0) + 3} className="trend-tick" textAnchor="end">0</text>
      <path d={path} fill="none" style={{ stroke: color, strokeWidth: 2 }} />
      {serie.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s.v)} r={3} style={{ fill: color }}>
          <title>{`${fmtT(s.fecha)} · ${s.v}${suffix}`}</title>
        </circle>
      ))}
      <text x={padL} y={H - 8} className="trend-tick">{fmtT(serie[0].fecha)}</text>
      {serie.length > 1 && <text x={W - padR} y={H - 8} className="trend-tick" textAnchor="end">{fmtT(serie[serie.length - 1].fecha)}</text>}
    </svg>
  )
}

// Pareto: barras = % del total (desc) + línea acumulada, un solo eje 0–100%.
export function Pareto({ items }: { items: { label: string; value: number }[] }) {
  const data = items.slice(0, 10)
  const total = data.reduce((a, b) => a + b.value, 0)
  if (!total) return <p className="muted" style={{ margin: '4px 0' }}>Sin datos en el periodo.</p>
  let acc = 0
  const rows = data.map((d) => { const share = d.value / total * 100; acc += share; return { ...d, share, cum: acc } })
  const W = 600, H = 210, padL = 30, padR = 34, padT = 14, padB = 62
  const n = rows.length, bw = (W - padL - padR) / n
  const y = (pct: number) => padT + ((100 - pct) / 100) * (H - padT - padB)
  const cx = (i: number) => padL + bw * (i + 0.5)
  const cumPath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${y(r.cum).toFixed(1)}`).join(' ')
  const short = (s: string) => (s.length > 12 ? s.slice(0, 11) + '…' : s)
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img">
      {[0, 50, 100].map((t) => <text key={t} x={padL - 4} y={y(t) + 3} className="trend-tick" textAnchor="end">{t}</text>)}
      <line x1={padL} x2={W - padR} y1={y(80)} y2={y(80)} className="par-ref" />
      <text x={W - padR + 2} y={y(80) + 3} className="trend-tick">80%</text>
      {rows.map((r, i) => (
        <g key={i}>
          <rect x={padL + bw * i + bw * 0.15} y={y(r.share)} width={bw * 0.7} height={Math.max(y(0) - y(r.share), 0)} className="par-bar">
            <title>{`${r.label}: ${r.value} (${r.share.toFixed(1)}%) · acumulado ${r.cum.toFixed(0)}%`}</title>
          </rect>
          <text x={cx(i)} y={y(r.share) - 3} className="par-val" textAnchor="middle">{r.value}</text>
          <text x={cx(i)} y={H - padB + 16} className="par-lbl" textAnchor="end" transform={`rotate(-32 ${cx(i)} ${H - padB + 16})`}>{short(r.label)}</text>
        </g>
      ))}
      <path d={cumPath} className="par-line" fill="none" />
      {rows.map((r, i) => <circle key={i} cx={cx(i)} cy={y(r.cum)} r={3} className="par-dot"><title>{`Acumulado: ${r.cum.toFixed(0)}%`}</title></circle>)}
    </svg>
  )
}

// Composición: barra 100% apilada (participación de cada categoría en el total).
export function Composicion({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0)
  if (!total) return <p className="muted" style={{ margin: '4px 0' }}>Sin datos en el periodo.</p>
  const PAL = ['var(--ch-1)', 'var(--ch-2)', 'var(--ch-3)', 'var(--ch-4)', 'var(--ch-5)', 'var(--ch-6)']
  const top = items.slice(0, 6)
  const resto = items.slice(6).reduce((a, b) => a + b.value, 0)
  const segs = top.map((d, i) => ({ label: d.label, value: d.value, pct: d.value / total * 100, color: PAL[i] }))
  if (resto > 0) segs.push({ label: 'Otros', value: resto, pct: resto / total * 100, color: 'var(--ch-other)' })
  return (
    <div>
      <div className="comp-bar">
        {segs.map((s, i) => (
          <div key={i} className="comp-seg" style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label}: ${s.value} (${s.pct.toFixed(1)}%)`} />
        ))}
      </div>
      <div className="comp-leg">
        {segs.map((s, i) => (
          <span key={i} className="comp-item"><span className="comp-dot" style={{ background: s.color }} />{s.label} · <b>{s.pct.toFixed(0)}%</b> ({s.value})</span>
        ))}
      </div>
    </div>
  )
}

// Matriz proceso × turno (cobertura / NC) con celdas sombreadas por magnitud.
export function Matriz({ turnos, filas, color = '#3b82f6' }: {
  turnos: string[]
  filas: { proceso: string; valores: number[]; total: number }[]
  color?: string
}) {
  if (!filas.length) return <p className="muted" style={{ margin: '4px 0' }}>Sin datos en el periodo.</p>
  const max = Math.max(...filas.flatMap((f) => f.valores), 1)
  const hex = color.replace('#', '')
  const rgb = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16))
  return (
    <div className="table-wrap">
      <table className="matriz">
        <thead>
          <tr><th>Proceso</th>{turnos.map((t) => <th key={t}>{t.replace('Turno ', 'T')}</th>)}<th>Total</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.proceso}>
              <td className="mproc">{f.proceso}</td>
              {f.valores.map((v, i) => (
                <td key={i} className="mcell" style={{ background: v ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.12 + 0.55 * (v / max)})` : undefined }}>{v || ''}</td>
              ))}
              <td className="mtot">{f.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
