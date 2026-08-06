import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend, fileUrl } from '../lib/api'
import { getUser } from '../lib/auth'
import FilterTable, { type Col } from '../components/FilterTable'
import RowActions from '../components/RowActions'
import type { F158Config, F158Recorrido, F158Item } from '../lib/types'

const fechaHora = (iso: string) => {
  const d = new Date(iso)
  return {
    fecha: d.toLocaleDateString('es-CO'),
    hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  }
}
const refItem = (r: F158Recorrido): F158Item | undefined =>
  r.items.find((i) => i.tipo === 'referencia' && i.valor)
const opValor = (r: F158Recorrido) => r.items.find((i) => i.campo_key === 'op')?.valor ?? ''
const contar = (r: F158Recorrido, res: string) =>
  r.items.filter((i) => i.tipo === 'cncna' && i.valor === res).length

const resPill = (v?: string | null) =>
  'res-pill ' + (v === 'C' ? 'r-c' : v === 'NC' ? 'r-nc' : 'r-na')

export default function RegistrosF158({ onEditar, onBack }: { onEditar?: (id: string) => void; onBack?: () => void }) {
  const [rows, setRows] = useState<F158Recorrido[]>([])
  const [config, setConfig] = useState<F158Config | null>(null)
  const [cargando, setCargando] = useState(true)
  const admin = getUser()?.rol === 'admin'

  const cargar = () => {
    setCargando(true)
    apiGet<F158Recorrido[]>('/f158/recorridos')
      .then(setRows)
      .catch(() => {})
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    apiGet<F158Config>('/f158/config').then(setConfig).catch(() => {})
    cargar()
  }, [])

  const procLabel = (key: string) => config?.procesos.find((p) => p.key === key)?.label ?? key

  async function borrar(r: F158Recorrido) {
    if (!window.confirm('¿Borrar este recorrido? Esta acción no se puede deshacer.')) return
    try {
      await apiSend('DELETE', `/f158/recorridos/${r.id}`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  const columns: Col<F158Recorrido>[] = useMemo(() => {
    const cols: Col<F158Recorrido>[] = [
      { key: 'fecha', label: 'Fecha', value: (r) => fechaHora(r.fecha_hora).fecha },
      { key: 'hora', label: 'Hora', value: (r) => fechaHora(r.fecha_hora).hora },
      { key: 'proceso', label: 'Proceso', value: (r) => procLabel(r.proceso) },
      { key: 'maquina', label: 'Máquina', value: (r) => r.maquina ?? '' },
      { key: 'op', label: 'OP', value: (r) => opValor(r) },
      { key: 'referencia', label: 'Referencia', value: (r) => refItem(r)?.valor ?? '' },
      { key: 'responsable', label: 'Responsable', value: (r) => r.responsable_nombre ?? '' },
      { key: 'cumple', label: 'Cumple (C)', value: (r) => String(contar(r, 'C')) },
      { key: 'nocumple', label: 'No cumple (NC)', value: (r) => String(contar(r, 'NC')) },
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

  const renderDetail = (r: F158Recorrido) => {
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

  return (
    <div>
      {onBack && <div className="btn-row" style={{ marginBottom: 6 }}><button className="btn btn-ghost" onClick={onBack}>← Reportes</button></div>}
      <div className="section-title">
        <span className="code">F-158</span>
        <h2>Registros de Rutas Calidad</h2>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', minHeight: 40 }} onClick={cargar}>↻ Actualizar</button>
      </div>
      {cargando ? <p className="muted">Cargando…</p> : (
        <FilterTable columns={columns} rows={rows} getKey={(r) => r.id} renderDetail={renderDetail} />
      )}
    </div>
  )
}
