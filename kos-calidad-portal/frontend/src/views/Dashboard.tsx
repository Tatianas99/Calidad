import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api'
import { BarList, VBars, LineMetric, Pareto, Composicion, TrendLine, Matriz, type BarItem } from '../components/Charts'

const AZUL = 'var(--ch-1)'   // volumen / actividad
const AMBAR = 'var(--ch-2)'  // defecto / lo que hay que vigilar

type Pct = { clave: string; nc: number; muestra: number; pct: number }
type Tot = { clave: string; total: number }
type Serie = { t: string; v: number }[]
type TendPct = { fecha: string; pct: number; nc: number; muestra: number }[]
type TendTot = { fecha: string; total: number }[]
type AguaMet = { fuera: number; total: number; fuera_pct: number; min: number; max: number; serie: Serie }
type Mat = { turnos: string[]; filas: { proceso: string; valores: number[]; total: number }[] }
type DashData = {
  desde: string | null; hasta: string | null
  filtracion: { por_turno: Pct[]; por_maquina: Pct[]; por_referencia: Pct[]; tendencia: TendPct }
  agua: { ph: AguaMet; cloro: AguaMet }
  claseb: { por_maquina: Tot[]; por_turno: Tot[]; por_referencia: Tot[]; por_op: Tot[]; tendencia: TendTot }
  rollos: { por_proveedor: Tot[]; por_turno: Tot[]; por_proceso: Tot[]; tendencia: TendTot }
  rutas: { cobertura: Mat; nc: Mat }
}
const tendPctSerie = (a: TendPct) => a.map((x) => ({ fecha: x.fecha, v: x.pct }))
const tendTotSerie = (a: TendTot) => a.map((x) => ({ fecha: x.fecha, v: x.total }))
const totBars = (a: Tot[]) => a.map((x) => ({ label: x.clave, value: x.total }))

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const primerDiaMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const ultimoDiaMes = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const esMismoMes = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
const pctItems = (a: Pct[]): BarItem[] => a.slice(0, 12).map((x) => ({ label: x.clave, value: x.pct, valueText: `${x.pct}%`, sub: `${x.nc} de ${x.muestra}` }))
const totItems = (a: Tot[]): BarItem[] => a.slice(0, 12).map((x) => ({ label: x.clave, value: x.total, valueText: String(x.total) }))

function Bloque({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel dash-block">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        {accion}
      </div>
      {children}
    </div>
  )
}
function Sub({ t }: { t: string }) { return <div className="dash-sub">{t}</div> }

// ---- Resumen ejecutivo de Clase B (informe sobre el rango del dashboard) ---- #
const ddmm = (iso: string) => { const [y, m, d2] = iso.split('-'); return `${d2}/${m}` }
const nf = (n: number) => Math.round(n).toLocaleString('es-CO')

function ResumenClaseB({ claseb, periodo, onClose }: { claseb: DashData['claseb']; periodo: string; onClose: () => void }) {
  const [modo, setModo] = useState<'referencia' | 'op'>('referencia')
  const serie = claseb.tendencia
  const total = serie.reduce((s, x) => s + x.total, 0)
  const dias = serie.length
  const prom = dias ? total / dias : 0
  const pico = serie.reduce((a, b) => (b.total > a.total ? b : a), { fecha: '', total: -1 })

  // Tendencia: promedio/día de la primera mitad vs la segunda.
  const mid = Math.floor(serie.length / 2)
  const avg = (arr: TendTot) => (arr.length ? arr.reduce((s, x) => s + x.total, 0) / arr.length : 0)
  const a1 = avg(serie.slice(0, mid)), a2 = avg(serie.slice(mid))
  const cambio = a1 ? (a2 - a1) / a1 * 100 : 0
  const dir = serie.length < 4 ? 'sin tendencia clara (pocos días)' : cambio > 12 ? 'al alza ↑' : cambio < -12 ? 'a la baja ↓' : 'estable →'

  const turnoTop = claseb.por_turno[0]
  const refTop = claseb.por_referencia[0]
  const maqTop = claseb.por_maquina[0]
  const conc3 = total ? claseb.por_referencia.slice(0, 3).reduce((s, x) => s + x.total, 0) / total * 100 : 0
  const pct = (v: number) => total ? Math.round(v / total * 100) : 0

  const desglose = modo === 'referencia' ? claseb.por_referencia : claseb.por_op
  let acc = 0
  const filas = desglose.slice(0, 10).map((x) => { acc += x.total; return { ...x, p: total ? x.total / total * 100 : 0, ac: total ? acc / total * 100 : 0 } })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 96vw)' }}>
        <button className="modal-close" title="Cerrar" onClick={onClose}>×</button>
        <div className="modal-body">
          <h3 style={{ marginTop: 0 }}>Resumen de Clase B</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Periodo: <strong>{periodo}</strong>. Clase B = producto retirado del empaque por defectos (aún funcional) que no puede llegar al cliente.
          </p>
          {total === 0 ? (
            <p className="muted">No hay Clase B registrada en el periodo seleccionado.</p>
          ) : (
            <>
              <div className="dash-tiles" style={{ marginBottom: 10 }}>
                <div className="stat-tile"><div className="stat-num">{nf(total)}</div><div className="stat-lbl">Unidades Clase B</div></div>
                <div className="stat-tile"><div className="stat-num">{nf(prom)}</div><div className="stat-lbl">Promedio por día</div><div className="muted" style={{ fontSize: '.76rem' }}>{dias} día(s) con registro</div></div>
                <div className="stat-tile"><div className="stat-num">{nf(pico.total)}</div><div className="stat-lbl">Día pico</div><div className="muted" style={{ fontSize: '.76rem' }}>{pico.fecha ? ddmm(pico.fecha) : '—'}</div></div>
              </div>

              <h4 style={{ margin: '10px 0 4px' }}>📈 Tendencia</h4>
              <p style={{ margin: 0 }}>
                La Clase B viene <strong>{dir}</strong>
                {serie.length >= 4 && <> — de <strong>{nf(a1)}</strong>/día en la primera mitad del periodo a <strong>{nf(a2)}</strong>/día en la segunda ({cambio >= 0 ? '+' : ''}{Math.round(cambio)}%)</>}.
                Día de mayor Clase B: <strong>{pico.fecha ? ddmm(pico.fecha) : '—'}</strong> con {nf(pico.total)} unidades.
              </p>

              <h4 style={{ margin: '12px 0 4px' }}>🕐 Turno</h4>
              <p style={{ margin: '0 0 4px' }}>
                {turnoTop ? <>El turno con más Clase B es <strong>{turnoTop.clave}</strong> con {nf(turnoTop.total)} unidades ({pct(turnoTop.total)}% del total).</> : '—'}
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                {claseb.por_turno.map((t) => `${t.clave}: ${nf(t.total)} (${pct(t.total)}%)`).join('  ·  ')}
              </p>

              <h4 style={{ margin: '12px 0 4px' }}>🏷️ Referencia más significativa</h4>
              <p style={{ margin: 0 }}>
                {refTop ? <><strong>{refTop.clave}</strong> con {nf(refTop.total)} unidades ({pct(refTop.total)}% del total). Las 3 referencias principales concentran <strong>{Math.round(conc3)}%</strong> de la Clase B.</> : '—'}
              </p>

              <h4 style={{ margin: '12px 0 4px' }}>⚙️ Máquina que más aporta</h4>
              <p style={{ margin: 0 }}>
                {maqTop ? <><strong>{maqTop.clave}</strong> con {nf(maqTop.total)} unidades ({pct(maqTop.total)}%).</> : '—'}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '14px 0 4px' }}>
                <h4 style={{ margin: 0 }}>Desglose (top 10)</h4>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={'btn pill-btn ' + (modo === 'referencia' ? 'btn-primary' : 'btn-ghost')} onClick={() => setModo('referencia')}>Por referencia</button>
                  <button className={'btn pill-btn ' + (modo === 'op' ? 'btn-primary' : 'btn-ghost')} onClick={() => setModo('op')}>Por OP</button>
                </div>
              </div>
              <div className="table-wrap">
                <table className="ftable">
                  <thead><tr><th>{modo === 'referencia' ? 'Referencia' : 'OP'}</th><th>Unidades</th><th>%</th><th>Acumulado</th></tr></thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={i}><td>{f.clave}</td><td>{nf(f.total)}</td><td>{Math.round(f.p)}%</td><td>{Math.round(f.ac)}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: '.78rem', marginBottom: 0 }}>Ordenado de mayor a menor. El acumulado ayuda a ver qué pocas {modo === 'referencia' ? 'referencias' : 'OP'} concentran la mayor parte (regla 80/20).</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [mes, setMes] = useState(() => primerDiaMes(new Date()))          // mes visto (default: actual)
  const [desde, setDesde] = useState(() => fmt(primerDiaMes(new Date())))  // mes actual …
  const [hasta, setHasta] = useState(() => fmt(new Date()))                // … hasta hoy
  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [d, setD] = useState<DashData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [verResumen, setVerResumen] = useState(false)

  // Debounce del buscador (no pega al servidor en cada tecla).
  useEffect(() => { const t = setTimeout(() => setQDeb(q), 400); return () => clearTimeout(t) }, [q])

  // El buscador NO está atado a la fecha: al empezar a buscar, se abre a todo el
  // historial (puedes acotar con Desde/Hasta); al borrar la búsqueda, vuelve al mes.
  const buscandoAntes = useRef(false)
  useEffect(() => {
    const buscando = !!qDeb.trim()
    if (buscando && !buscandoAntes.current) { setDesde(''); setHasta('') }
    else if (!buscando && buscandoAntes.current) {
      const now = new Date(); setMes(primerDiaMes(now)); setDesde(fmt(primerDiaMes(now))); setHasta(fmt(now))
    }
    buscandoAntes.current = buscando
  }, [qDeb])

  useEffect(() => {
    setCargando(true)
    const qs = new URLSearchParams()
    if (desde) qs.set('desde', desde)
    if (hasta) qs.set('hasta', hasta)
    if (qDeb.trim()) qs.set('q', qDeb.trim())
    apiGet<DashData>(`/dashboard?${qs.toString()}`)
      .then(setD).catch(() => setD(null)).finally(() => setCargando(false))
  }, [desde, hasta, qDeb])

  const irMes = (delta: number) => {
    const nuevo = new Date(mes.getFullYear(), mes.getMonth() + delta, 1)
    setMes(nuevo)
    const esActual = esMismoMes(nuevo, new Date())
    setDesde(fmt(primerDiaMes(nuevo)))
    setHasta(fmt(esActual ? new Date() : ultimoDiaMes(nuevo)))
  }
  const mesLabel = mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  const tile = (m: AguaMet, label: string) => (
    <div className="stat-tile">
      <div className={'stat-num' + (m.fuera > 0 ? ' bad' : ' ok')}>{m.fuera_pct}%</div>
      <div className="stat-lbl">{label} fuera de rango</div>
      <div className="muted" style={{ fontSize: '.78rem' }}>{m.fuera} de {m.total} mediciones</div>
    </div>
  )

  return (
    <div>
      <div className="section-title">
        <span className="code">📊</span>
        <h2>Dashboard de calidad</h2>
      </div>

      <div className="dash-filtros">
        <div className="mes-nav">
          <button className="seg" onClick={() => irMes(-1)} title="Mes anterior">‹</button>
          <span className="mes-lbl">{mesLabel}</span>
          <button className="seg" onClick={() => irMes(1)} disabled={esMismoMes(mes, new Date())} title="Mes siguiente">›</button>
        </div>
        <label className="fecha-in">Desde <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="fecha-in">Hasta <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
        <input className="dash-buscar" type="search" placeholder="🔎 Buscar OP, referencia o marca…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {cargando && <p className="muted">Cargando…</p>}
      {!cargando && !d && <p className="muted">No se pudo cargar el dashboard.</p>}
      {!cargando && d && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Periodo: {desde || hasta ? `${desde || 'inicio'} a ${hasta || 'hoy'}` : 'todo el historial'}
            {qDeb.trim() && <> · <strong>Buscando «{qDeb.trim()}»</strong> en OP/referencia/marca (todo el historial; acota con Desde/Hasta si quieres · aplica a Filtración, Clase B y Rutas)</>}
          </p>

          {/* Filtración */}
          <Bloque titulo="Filtración (F-006) — % de No Cumple">
            <div className="dash-2col">
              <div><Sub t="Por turno" /><VBars items={pctItems(d.filtracion.por_turno)} color={AMBAR} /></div>
              <div><Sub t="Tendencia de % NC por día" /><LineMetric serie={tendPctSerie(d.filtracion.tendencia)} suffix="%" color={AMBAR} /></div>
            </div>
            <div className="dash-2col" style={{ marginTop: 10 }}>
              <div><Sub t="Por máquina" /><BarList items={pctItems(d.filtracion.por_maquina)} color={AMBAR} /></div>
              <div><Sub t="Por referencia" /><BarList items={pctItems(d.filtracion.por_referencia)} color={AMBAR} /></div>
            </div>
          </Bloque>

          {/* Cloro y PH */}
          <Bloque titulo="Cloro y PH (F-015)">
            <div className="dash-tiles">{tile(d.agua.ph, 'PH')}{tile(d.agua.cloro, 'Cloro')}</div>
            <div className="dash-2col" style={{ marginTop: 8 }}>
              <div><Sub t={`Tendencia PH (rango ${d.agua.ph.min}–${d.agua.ph.max})`} /><TrendLine serie={d.agua.ph.serie} min={d.agua.ph.min} max={d.agua.ph.max} /></div>
              <div><Sub t={`Tendencia Cloro (rango ${d.agua.cloro.min}–${d.agua.cloro.max})`} /><TrendLine serie={d.agua.cloro.serie} min={d.agua.cloro.min} max={d.agua.cloro.max} /></div>
            </div>
          </Bloque>

          {/* Clase B */}
          <Bloque
            titulo="Clase B (F-204) — unidades"
            accion={<button className="btn btn-primary" style={{ minHeight: 36 }} onClick={() => setVerResumen(true)}>📋 Resumen de Clase B</button>}
          >
            <div className="dash-2col">
              <div>
                <Sub t="Por máquina (Pareto)" />
                <Pareto items={totBars(d.claseb.por_maquina)} />
                <p className="muted" style={{ fontSize: '.76rem', margin: '2px 0 0' }}>Barras = % del total · línea = acumulado · referencia 80%.</p>
              </div>
              <div><Sub t="Tendencia de Clase B por día" /><LineMetric serie={tendTotSerie(d.claseb.tendencia)} color={AMBAR} /></div>
            </div>
            <div className="dash-2col" style={{ marginTop: 10 }}>
              <div><Sub t="Por turno" /><VBars items={totItems(d.claseb.por_turno)} color={AMBAR} /></div>
              <div><Sub t="Por referencia" /><BarList items={totItems(d.claseb.por_referencia)} color={AMBAR} /></div>
            </div>
          </Bloque>

          {/* Liberación de rollos */}
          <Bloque titulo="Liberación de rollos (F-005) — liberaciones">
            <div className="dash-2col">
              <div><Sub t="Por turno" /><VBars items={totItems(d.rollos.por_turno)} color={AZUL} /></div>
              <div><Sub t="Tendencia por día" /><LineMetric serie={tendTotSerie(d.rollos.tendencia)} color={AZUL} /></div>
            </div>
            <div className="dash-2col" style={{ marginTop: 10 }}>
              <div><Sub t="Por proveedor (composición)" /><Composicion items={totBars(d.rollos.por_proveedor)} /></div>
              <div><Sub t="Por proceso (composición)" /><Composicion items={totBars(d.rollos.por_proceso)} /></div>
            </div>
          </Bloque>

          {/* Rutas Calidad */}
          <Bloque titulo="Rutas Calidad (F-158) — proceso × turno">
            <div className="dash-2col">
              <div><Sub t="Cobertura de recorridos" /><Matriz turnos={d.rutas.cobertura.turnos} filas={d.rutas.cobertura.filas} color={AZUL} /></div>
              <div><Sub t="Ítems No Cumple (NC)" /><Matriz turnos={d.rutas.nc.turnos} filas={d.rutas.nc.filas} color={AMBAR} /></div>
            </div>
          </Bloque>

          <p className="muted" style={{ fontSize: '.78rem' }}>
            Turnos derivados de la hora en F-005 y F-158 (T1 06–14 · T2 14–22 · T3 22–06).
          </p>

          {verResumen && (
            <ResumenClaseB
              claseb={d.claseb}
              periodo={(desde || hasta) ? `${desde || 'inicio'} a ${hasta || 'hoy'}` : 'todo el historial'}
              onClose={() => setVerResumen(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
