import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { getUser } from '../lib/auth'
import FilterTable, { type Col } from '../components/FilterTable'
import RowActions from '../components/RowActions'
import type { Referencia, Maquina, F204Registro } from '../lib/types'

const fh = (iso: string) => {
  const d = new Date(iso)
  return { fecha: d.toLocaleDateString('es-CO'), hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }
}
const resClass = (v?: string | null) => (v === 'C' ? 'tag-ok' : v === 'NC' ? 'tag-bad' : 'muted')

export default function RegistrosF204({ onEditar, onBack }: { onEditar?: (id: string) => void; onBack?: () => void }) {
  const [rows, setRows] = useState<F204Registro[]>([])
  const [refs, setRefs] = useState<Referencia[]>([])
  const [maqs, setMaqs] = useState<Maquina[]>([])
  const [cargando, setCargando] = useState(true)
  const admin = getUser()?.rol === 'admin'

  const cargar = () => {
    setCargando(true)
    apiGet<F204Registro[]>('/f204/registros').then(setRows).catch(() => {}).finally(() => setCargando(false))
  }
  useEffect(() => {
    apiGet<Referencia[]>('/catalogos/referencias').then(setRefs).catch(() => {})
    apiGet<Maquina[]>('/catalogos/maquinas').then(setMaqs).catch(() => {})
    cargar()
  }, [])

  // La referencia ahora viene de la OP como texto; la FK vieja es respaldo.
  const refName = (reg: F204Registro) => {
    if (reg.referencia_texto) return reg.referencia_texto
    if (!reg.referencia_id) return ''
    const r = refs.find((x) => x.id === reg.referencia_id)
    return r ? (r.descripcion ? `${r.codigo} ${r.descripcion}` : r.codigo) : ''
  }
  const maqName = (id?: number | null) => (id ? maqs.find((m) => m.id === id)?.nombre ?? `#${id}` : '')
  const maquinaDe = (r: F204Registro) => r.maquina_texto || maqName(r.maquina_id)

  async function borrar(r: F204Registro) {
    if (!window.confirm('¿Borrar este registro F-204? Esta acción no se puede deshacer.')) return
    try {
      await apiSend('DELETE', `/f204/registros/${r.id}`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    } catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo borrar') }
  }

  const columns: Col<F204Registro>[] = useMemo(() => {
    const cols: Col<F204Registro>[] = [
      { key: 'fecha', label: 'Fecha', value: (r) => fh(r.fecha_hora).fecha },
      { key: 'hora', label: 'Hora', value: (r) => fh(r.fecha_hora).hora },
      { key: 'turno', label: 'Turno', value: (r) => `T${r.turno}` },
      { key: 'op', label: 'OP', value: (r) => r.orden_produccion ?? '' },
      { key: 'maquina', label: 'Máquina', value: (r) => maquinaDe(r) },
      { key: 'referencia', label: 'Referencia', value: (r) => refName(r) },
      { key: 'marca', label: 'Marca', value: (r) => r.marca ?? '' },
      { key: 'claseb', label: 'Clase B', value: (r) => (r.cantidad_clase_b != null ? String(r.cantidad_clase_b) : '') },
      {
        key: 'desperdicio', label: 'Desperdicio', value: (r) => r.verificacion_desperdicio ?? '',
        render: (r) => <span className={resClass(r.verificacion_desperdicio)}>{r.verificacion_desperdicio ?? '—'}</span>,
      },
      { key: 'entregado', label: 'Entregado por', value: (r) => r.entregado_por_nombre ?? '' },
      { key: 'recibido', label: 'Recibido por', value: (r) => r.recibido_por_nombre ?? '' },
    ]
    if (admin) cols.push({
      key: 'acciones', label: '', noFilter: true, value: () => '',
      render: (r) => <RowActions onEdit={onEditar ? () => onEditar(r.id) : undefined} onDelete={() => borrar(r)} />,
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs, maqs, onEditar, admin])

  const renderDetail = (r: F204Registro) => (
    <div className="detalle">
      <div style={{ gridColumn: '1 / -1' }} className="muted">
        {fh(r.fecha_hora).fecha} {fh(r.fecha_hora).hora} · Turno {r.turno} · {maquinaDe(r)}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div className="emb-grid">
          <span className="emb-chip">Referencia: <b>{refName(r)}{r.marca ? ` ${r.marca}` : ''}</b></span>
          <span className="emb-chip">Clase B: <b>{r.cantidad_clase_b ?? '—'}</b></span>
          <span className="emb-chip">Desperdicio: <b className={resClass(r.verificacion_desperdicio)}>{r.verificacion_desperdicio ?? '—'}</b></span>
          <span className="emb-chip">Entregado por: <b>{r.entregado_por_nombre ?? '—'}</b></span>
          <span className="emb-chip">Recibido por: <b>{r.recibido_por_nombre ?? '—'}</b></span>
        </div>
      </div>
      {r.observaciones && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h4>Observaciones</h4>
          <p className="muted" style={{ margin: 0 }}>{r.observaciones}</p>
        </div>
      )}
    </div>
  )

  return (
    <div>
      {onBack && <div className="btn-row" style={{ marginBottom: 6 }}><button className="btn btn-ghost" onClick={onBack}>← Reportes</button></div>}
      <div className="section-title">
        <span className="code">F-204</span>
        <h2>Registros de Clase B y desperdicio</h2>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', minHeight: 40 }} onClick={cargar}>↻ Actualizar</button>
      </div>
      {cargando ? <p className="muted">Cargando…</p> : (
        <FilterTable columns={columns} rows={rows} getKey={(r) => r.id} renderDetail={renderDetail} />
      )}
    </div>
  )
}
