import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend, fileUrl } from '../lib/api'
import { getUser } from '../lib/auth'
import { matchKeywords } from '../lib/fuzzy'
import FilterTable, { type Col } from '../components/FilterTable'
import RowActions from '../components/RowActions'
import PdfExport from '../components/PdfExport'
import { RangoFechas, hoyISO, haceDiasISO } from '../components/RangoFechas'
import type { F158Config, F158Recorrido, F158RecorridoResumen } from '../lib/types'

const fechaHora = (iso: string) => {
  const d = new Date(iso)
  return {
    fecha: d.toLocaleDateString('es-CO'),
    hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  }
}
const resPill = (v?: string | null) =>
  'res-pill ' + (v === 'C' ? 'r-c' : v === 'NC' ? 'r-nc' : 'r-na')

// Detalle de un recorrido: se pide al abrir la fila (la lista es liviana y no
// trae el checklist ni las fotos, para que cargue rápido).
function DetalleF158({ id }: { id: string }) {
  const [r, setR] = useState<F158Recorrido | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let vivo = true
    apiGet<F158Recorrido>(`/f158/recorridos/${id}`)
      .then((d) => { if (vivo) setR(d) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [id])

  if (error) return <p className="tag-bad">No se pudo cargar el detalle.</p>
  if (!r) return <p className="muted">Cargando detalle…</p>

  // La OP y la Referencia ya están en el listado; no se repiten aquí.
  const items = r.items.filter((i) => i.campo_key !== 'op' && i.tipo !== 'referencia')
  return (
    <div className="detalle">
      <div style={{ gridColumn: '1 / -1' }} className="muted">
        Registrado por <b>{r.responsable_nombre ?? '—'}</b>{r.actualizado_en ? ' · editado' : ''}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <h4>Checklist</h4>
        <div className="emb-grid">
          {items.map((it) => (
            <span key={it.campo_key} className="emb-chip">
              {it.campo_label}:{' '}
              {it.tipo === 'cncna'
                ? <span className={resPill(it.valor)}>{it.valor || '—'}</span>
                : <b>{it.valor || '—'}</b>}
            </span>
          ))}
          {items.length === 0 && <span className="muted">Sin ítems.</span>}
        </div>
      </div>
      {r.observaciones && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h4>Observaciones</h4>
          <p className="muted" style={{ margin: 0 }}>{r.observaciones}</p>
        </div>
      )}
      <div style={{ gridColumn: '1 / -1' }}>
        <h4>Registro fotográfico / video</h4>
        {r.adjuntos.length === 0 && <span className="muted">Sin archivos adjuntos.</span>}
        <div className="adj-grid">
          {r.adjuntos.map((a) => (
            a.tipo === 'video' ? (
              <video key={a.id} className="adj-media" src={fileUrl(a.url)} controls preload="metadata" />
            ) : (
              <a key={a.id} href={fileUrl(a.url)} target="_blank" rel="noreferrer">
                <img className="adj-media" src={fileUrl(a.url)} alt={a.nombre} loading="lazy" />
              </a>
            )
          ))}
        </div>
      </div>
    </div>
  )
}

export default function RegistrosF158({ onEditar, onBack }: { onEditar?: (id: string) => void; onBack?: () => void }) {
  const [rows, setRows] = useState<F158RecorridoResumen[]>([])
  const [config, setConfig] = useState<F158Config | null>(null)
  const [cargando, setCargando] = useState(true)
  const [busqRollo, setBusqRollo] = useState('')
  const admin = getUser()?.rol === 'admin'
  const [desde, setDesde] = useState(haceDiasISO(30))
  const [hasta, setHasta] = useState(hoyISO())

  const cargar = () => {
    setCargando(true)
    apiGet<F158RecorridoResumen[]>(`/f158/recorridos/resumen?desde=${desde}&hasta=${hasta}`)
      .then(setRows)
      .catch(() => {})
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    apiGet<F158Config>('/f158/config').then(setConfig).catch(() => {})
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [desde, hasta])

  const procLabel = (key: string) => config?.procesos.find((p) => p.key === key)?.label ?? key

  async function borrar(r: F158RecorridoResumen) {
    if (!window.confirm('¿Borrar este recorrido? Esta acción no se puede deshacer.')) return
    try {
      await apiSend('DELETE', `/f158/recorridos/${r.id}`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  const columns: Col<F158RecorridoResumen>[] = useMemo(() => {
    const cols: Col<F158RecorridoResumen>[] = [
      { key: 'fecha', label: 'Fecha', value: (r) => fechaHora(r.fecha_hora).fecha },
      { key: 'hora', label: 'Hora', value: (r) => fechaHora(r.fecha_hora).hora },
      { key: 'proceso', label: 'Proceso', value: (r) => procLabel(r.proceso) },
      { key: 'maquina', label: 'Máquina', value: (r) => r.maquina ?? '' },
      { key: 'op', label: 'OP', value: (r) => r.op ?? '' },
      { key: 'rollo', label: 'Lote / N° rollo', value: (r) => r.rollo ?? '' },
      { key: 'referencia', label: 'Referencia', value: (r) => r.referencia ?? '' },
      { key: 'responsable', label: 'Responsable', value: (r) => r.responsable_nombre ?? '' },
      { key: 'cumple', label: 'Cumple (C)', value: (r) => String(r.c_count) },
      { key: 'nocumple', label: 'No cumple (NC)', value: (r) => String(r.nc_count) },
    ]
    if (admin) cols.push({
      key: 'acciones', label: '', noFilter: true, value: () => '',
      render: (r) => (
        <RowActions onEdit={onEditar ? () => onEditar(r.id) : undefined} onDelete={() => borrar(r)} />
      ),
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, onEditar, admin])

  const renderDetail = (r: F158RecorridoResumen) => <DetalleF158 id={r.id} />

  return (
    <div>
      {onBack && <div className="btn-row" style={{ marginBottom: 6 }}><button className="btn btn-ghost" onClick={onBack}>← Reportes</button></div>}
      <div className="section-title">
        <span className="code">F-158</span>
        <h2>Registros de Rutas Calidad</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <PdfExport formato="f158" />
          <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={cargar}>↻ Actualizar</button>
        </div>
      </div>
      <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
      <div style={{ margin: '4px 0 12px' }}>
        <input
          className="filt-search"
          type="search"
          placeholder="🔎 Buscar por N° o lote de rollo (Slitter / Troqueladora)…"
          value={busqRollo}
          onChange={(e) => setBusqRollo(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>
      {cargando ? <p className="muted">Cargando…</p> : (
        <FilterTable
          columns={columns}
          rows={rows.filter((r) => matchKeywords(busqRollo, r.rollo ?? ''))}
          getKey={(r) => r.id}
          renderDetail={renderDetail}
        />
      )}
    </div>
  )
}
