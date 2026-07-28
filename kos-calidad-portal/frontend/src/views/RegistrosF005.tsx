import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { getUser } from '../lib/auth'
import FilterTable, { type Col } from '../components/FilterTable'
import RowActions from '../components/RowActions'
import type { F005Registro } from '../lib/types'

const fh = (iso: string) => {
  const d = new Date(iso)
  return { fecha: d.toLocaleDateString('es-CO'), hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }
}
const resClass = (v?: string | null) => (v === 'C' ? 'tag-ok' : v === 'NC' ? 'tag-bad' : 'muted')
const PROC_LABEL: Record<string, string> = { slitter: 'Slitter', flexo: 'Flexo', troquelado: 'Troqueladora' }
const procName = (p?: string | null) => (p ? PROC_LABEL[p] ?? p : '')

const ESTADO = [
  ['estado_dinas', 'Prueba de dinas'],
  ['estado_alcohol', 'Prueba de alcohol'],
  ['estado_lapiz', 'Prueba de lápiz'],
  ['estado_armado', 'Prueba de armado'],
  ['estado_inocuidad', 'Inocuidad'],
] as const

export default function RegistrosF005({ onEditar, onBack }: { onEditar?: (id: string) => void; onBack?: () => void }) {
  const [rows, setRows] = useState<F005Registro[]>([])
  const [cargando, setCargando] = useState(true)
  const admin = getUser()?.rol === 'admin'

  const cargar = () => {
    setCargando(true)
    apiGet<F005Registro[]>('/f005/registros').then(setRows).catch(() => {}).finally(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])

  async function borrar(r: F005Registro) {
    if (!window.confirm('¿Borrar este registro F-005? Esta acción no se puede deshacer.')) return
    try {
      await apiSend('DELETE', `/f005/registros/${r.id}`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    } catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo borrar') }
  }

  const columns: Col<F005Registro>[] = useMemo(() => {
    const cols: Col<F005Registro>[] = [
      { key: 'fecha', label: 'Fecha', value: (r) => fh(r.fecha_hora).fecha },
      { key: 'hora', label: 'Hora', value: (r) => fh(r.fecha_hora).hora },
      { key: 'proceso', label: 'Proceso', value: (r) => procName(r.proceso) },
      { key: 'maquina', label: 'Máquina', value: (r) => r.maquina ?? '' },
      { key: 'lote', label: 'Lote', value: (r) => r.lote },
      { key: 'material', label: 'Material', value: (r) => r.material ?? '' },
      { key: 'ancho', label: 'Ancho', value: (r) => r.ancho ?? '' },
      { key: 'calibre', label: 'Calibre', value: (r) => r.calibre ?? '' },
      { key: 'kg', label: 'Kg', value: (r) => r.kg ?? '' },
      { key: 'dinas', label: 'Dinas', value: (r) => r.estado_dinas ?? '', render: (r) => <span className={resClass(r.estado_dinas)}>{r.estado_dinas ?? '—'}</span> },
      { key: 'alcohol', label: 'Alcohol', value: (r) => r.estado_alcohol ?? '', render: (r) => <span className={resClass(r.estado_alcohol)}>{r.estado_alcohol ?? '—'}</span> },
      { key: 'lapiz', label: 'Lápiz', value: (r) => r.estado_lapiz ?? '', render: (r) => <span className={resClass(r.estado_lapiz)}>{r.estado_lapiz ?? '—'}</span> },
      { key: 'armado', label: 'Armado', value: (r) => r.estado_armado ?? '', render: (r) => <span className={resClass(r.estado_armado)}>{r.estado_armado ?? '—'}</span> },
      { key: 'inocuidad', label: 'Inocuidad', value: (r) => r.estado_inocuidad ?? '', render: (r) => <span className={resClass(r.estado_inocuidad)}>{r.estado_inocuidad ?? '—'}</span> },
      { key: 'proveedor', label: 'Proveedor', value: (r) => r.proveedor ?? '' },
      { key: 'responsable', label: 'Responsable', value: (r) => r.responsable_nombre ?? '' },
      { key: 'observaciones', label: 'Observaciones', value: (r) => r.observaciones ?? '' },
    ]
    if (admin) cols.push({
      key: 'acciones', label: '', noFilter: true, value: () => '',
      render: (r) => <RowActions onEdit={onEditar ? () => onEditar(r.id) : undefined} onDelete={() => borrar(r)} />,
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEditar, admin])

  const renderDetail = (r: F005Registro) => (
    <div className="detalle">
      <div style={{ gridColumn: '1 / -1' }} className="muted">
        {fh(r.fecha_hora).fecha} {fh(r.fecha_hora).hora} · Responsable: <b>{r.responsable_nombre ?? '—'}</b>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div className="emb-grid">
          <span className="emb-chip">Proceso: <b>{procName(r.proceso) || '—'}</b></span>
          <span className="emb-chip">Máquina: <b>{r.maquina ?? '—'}</b></span>
          <span className="emb-chip">Lote: <b>{r.lote}</b></span>
          <span className="emb-chip">Material: <b>{r.material ?? '—'}</b></span>
          <span className="emb-chip">Ancho: <b>{r.ancho ?? '—'}</b></span>
          <span className="emb-chip">Calibre: <b>{r.calibre ?? '—'}</b></span>
          <span className="emb-chip">Kg: <b>{r.kg ?? '—'}</b></span>
          <span className="emb-chip">Proveedor: <b>{r.proveedor ?? '—'}</b></span>
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <h4>Estado</h4>
        <div className="emb-grid">
          {ESTADO.map(([key, label]) => (
            <span key={key} className="emb-chip">{label}: <b className={resClass(r[key])}>{r[key] ?? '—'}</b></span>
          ))}
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
        <span className="code">F-005</span>
        <h2>Registros de liberación de rollos</h2>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', minHeight: 40 }} onClick={cargar}>↻ Actualizar</button>
      </div>
      {cargando ? <p className="muted">Cargando…</p> : (
        <FilterTable columns={columns} rows={rows} getKey={(r) => r.id} renderDetail={renderDetail} />
      )}
    </div>
  )
}
