import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend, fileUrl } from '../lib/api'
import { getUser } from '../lib/auth'
import FilterTable, { type Col } from '../components/FilterTable'
import RowActions from '../components/RowActions'
import { RangoFechas, hoyISO, haceDiasISO } from '../components/RangoFechas'
import type { EstRegistro, EstResumen } from '../lib/types'

const fechaHora = (iso: string) => {
  const d = new Date(iso)
  return {
    fecha: d.toLocaleDateString('es-CO'),
    hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  }
}

// Detalle de un registro: se pide al abrir la fila (la lista es liviana, sin fotos).
function DetalleEstand({ id }: { id: string }) {
  const [r, setR] = useState<EstRegistro | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let vivo = true
    apiGet<EstRegistro>(`/estandarizacion/registros/${id}`)
      .then((d) => { if (vivo) setR(d) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [id])

  if (error) return <p className="tag-bad">No se pudo cargar el detalle.</p>
  if (!r) return <p className="muted">Cargando detalle…</p>

  const dato = (label: string, valor?: string | null) => (
    <span className="emb-chip">{label}: <b>{valor || '—'}</b></span>
  )
  const hs: Array<[string, string | null | undefined]> = [
    ['H1', r.h1], ['H2', r.h2], ['H3', r.h3], ['H4', r.h4], ['H5', r.h5], ['H6', r.h6],
  ]
  const tablero = r.adjuntos.filter((a) => a.categoria === 'tablero')
  const vaso = r.adjuntos.filter((a) => a.categoria !== 'tablero')

  const fotos = (lista: EstRegistro['adjuntos']) => (
    <div className="adj-grid">
      {lista.map((a) => (
        a.tipo === 'video' ? (
          <video key={a.id} className="adj-media" src={fileUrl(a.url)} controls preload="metadata" />
        ) : (
          <a key={a.id} href={fileUrl(a.url)} target="_blank" rel="noreferrer">
            <img className="adj-media" src={fileUrl(a.url)} alt={a.nombre} loading="lazy" />
          </a>
        )
      ))}
    </div>
  )

  return (
    <div className="detalle">
      <div style={{ gridColumn: '1 / -1' }} className="muted">
        Registrado por <b>{r.responsable_nombre ?? '—'}</b>{r.actualizado_en ? ' · editado' : ''}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <h4>Datos</h4>
        <div className="emb-grid">
          {dato('Máquina', r.maquina)}
          {dato('OP', r.orden_produccion)}
          {dato('Referencia', r.referencia_texto)}
          {dato('Marca', r.marca)}
          {dato('Calibre', r.calibre)}
          {dato('Proveedor papel', r.proveedor_papel)}
          {dato('Tipo de papel', r.tipo_papel)}
          {dato('Tipo de humectación', r.tipo_humectacion)}
          {dato('Calidad vaso', r.calidad_vaso)}
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <h4>Resistencias (tablero)</h4>
        <div className="emb-grid">
          {hs.map(([k, v]) => dato(k, v))}
        </div>
      </div>
      {r.observaciones && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h4>Observaciones</h4>
          <p className="muted" style={{ margin: 0 }}>{r.observaciones}</p>
        </div>
      )}
      {tablero.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h4>Foto del tablero</h4>
          {fotos(tablero)}
        </div>
      )}
      <div style={{ gridColumn: '1 / -1' }}>
        <h4>Registro fotográfico (calidad del vaso)</h4>
        {vaso.length === 0 && <span className="muted">Sin fotos de vaso.</span>}
        {vaso.length > 0 && fotos(vaso)}
      </div>
    </div>
  )
}

export default function RegistrosEstandarizacion({ onBack }: { onBack?: () => void }) {
  const [rows, setRows] = useState<EstResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const admin = getUser()?.rol === 'admin'
  const [desde, setDesde] = useState(haceDiasISO(30))
  const [hasta, setHasta] = useState(hoyISO())

  const cargar = () => {
    setCargando(true)
    apiGet<EstResumen[]>(`/estandarizacion/registros?desde=${desde}&hasta=${hasta}`)
      .then(setRows)
      .catch(() => {})
      .finally(() => setCargando(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [desde, hasta])

  async function borrar(r: EstResumen) {
    if (!window.confirm('¿Borrar este registro? Esta acción no se puede deshacer.')) return
    try {
      await apiSend('DELETE', `/estandarizacion/registros/${r.id}`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  const columns: Col<EstResumen>[] = useMemo(() => {
    const cols: Col<EstResumen>[] = [
      { key: 'fecha', label: 'Fecha', value: (r) => fechaHora(r.fecha_hora).fecha },
      { key: 'hora', label: 'Hora', value: (r) => fechaHora(r.fecha_hora).hora },
      { key: 'maquina', label: 'Máquina', value: (r) => r.maquina ?? '' },
      { key: 'op', label: 'OP', value: (r) => r.orden_produccion ?? '' },
      { key: 'referencia', label: 'Referencia', value: (r) => r.referencia_texto ?? '' },
      { key: 'marca', label: 'Marca', value: (r) => r.marca ?? '' },
      { key: 'calibre', label: 'Calibre', value: (r) => r.calibre ?? '' },
      { key: 'tipo_papel', label: 'Tipo papel', value: (r) => r.tipo_papel ?? '' },
      { key: 'responsable', label: 'Responsable', value: (r) => r.responsable_nombre ?? '' },
    ]
    if (admin) cols.push({
      key: 'acciones', label: '', noFilter: true, value: () => '',
      render: (r) => <RowActions onDelete={() => borrar(r)} />,
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  return (
    <div>
      {onBack && <div className="btn-row" style={{ marginBottom: 6 }}><button className="btn btn-ghost" onClick={onBack}>← Reportes</button></div>}
      <div className="section-title">
        <span className="code">🔬</span>
        <h2>Registros de Estandarización</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={cargar}>↻ Actualizar</button>
        </div>
      </div>
      <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
      {cargando ? <p className="muted">Cargando…</p> : (
        <FilterTable
          columns={columns}
          rows={rows}
          getKey={(r) => r.id}
          renderDetail={(r) => <DetalleEstand id={r.id} />}
        />
      )}
    </div>
  )
}
