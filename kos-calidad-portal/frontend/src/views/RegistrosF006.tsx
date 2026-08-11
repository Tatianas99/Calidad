import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { getUser } from '../lib/auth'
import FilterTable, { type Col } from '../components/FilterTable'
import RowActions from '../components/RowActions'
import type { Referencia, Maquina, Persona, Opciones, F006Registro, Option } from '../lib/types'

const label = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v
const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''

export default function RegistrosF006({ onEditar, onBack }: { onEditar?: (id: string) => void; onBack?: () => void }) {
  const [rows, setRows] = useState<F006Registro[]>([])
  const [refs, setRefs] = useState<Referencia[]>([])
  const [maqs, setMaqs] = useState<Maquina[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [opts, setOpts] = useState<Opciones | null>(null)
  const [cargando, setCargando] = useState(true)
  const admin = getUser()?.rol === 'admin'

  const cargar = () => {
    setCargando(true)
    apiGet<F006Registro[]>('/f006/registros')
      .then((d) => setRows(d))
      .catch(() => {})
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    apiGet<Referencia[]>('/catalogos/referencias').then(setRefs).catch(() => {})
    apiGet<Maquina[]>('/catalogos/maquinas').then(setMaqs).catch(() => {})
    apiGet<Persona[]>('/catalogos/personas').then(setPersonas).catch(() => {})
    apiGet<Opciones>('/catalogos/opciones').then(setOpts).catch(() => {})
    cargar()
  }, [])

  async function borrar(r: F006Registro) {
    if (!window.confirm('¿Borrar este registro F-006? Esta acción no se puede deshacer.')) return
    try {
      await apiSend('DELETE', `/f006/registros/${r.id}`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  // La referencia ahora viene de la OP como texto; la FK vieja es respaldo.
  const refName = (reg: F006Registro) => {
    if (reg.referencia_texto) return reg.referencia_texto
    if (!reg.referencia_id) return ''
    const r = refs.find((x) => x.id === reg.referencia_id)
    return r ? (r.descripcion ? `${r.codigo} ${r.descripcion}` : r.codigo) : ''
  }
  const maqName = (id?: number | null) => (id ? maqs.find((m) => m.id === id)?.nombre ?? `#${id}` : '')
  const personaName = (id?: number | null) => (id ? personas.find((p) => p.id === id)?.nombre ?? `#${id}` : '—')

  const sum = (r: F006Registro, key: 'cantidad_muestra' | 'cantidad_cumple' | 'cantidad_nocumple') =>
    r.filtraciones.reduce((a, f) => a + ((f[key] as number | null | undefined) ?? 0), 0)

  const columns: Col<F006Registro>[] = useMemo(() => [
    { key: 'fecha', label: 'Fecha', value: (r) => r.fecha },
    { key: 'turno', label: 'Turno', value: (r) => `T${r.turno}` },
    { key: 'op', label: 'OP', value: (r) => r.orden_produccion ?? '' },
    { key: 'maquina', label: 'Máquina', value: (r) => r.maquina_texto || maqName(r.maquina_id) },
    { key: 'referencia', label: 'Referencia', value: (r) => refName(r) },
    { key: 'marca', label: 'Marca', value: (r) => r.marca ?? '' },
    { key: 'auxiliar', label: 'Auxiliar', value: (r) => r.auxiliar_nombre || personaName(r.auxiliar_id) },
    { key: 'muestra', label: 'Muestra', value: (r) => String(sum(r, 'cantidad_muestra')) },
    { key: 'cumple', label: 'Cumple', value: (r) => String(sum(r, 'cantidad_cumple')) },
    { key: 'nocumple', label: 'No cumple', value: (r) => String(sum(r, 'cantidad_nocumple')) },
    {
      key: 'pct_nc', label: '% de NC',
      value: (r) => {
        const m = sum(r, 'cantidad_muestra')
        const nc = sum(r, 'cantidad_nocumple')
        return m > 0 ? `${(nc / m * 100).toFixed(1)}%` : '—'
      },
    },
    ...(admin ? [{
      key: 'acciones', label: '', noFilter: true, value: () => '',
      render: (r: F006Registro) => (
        <RowActions
          onEdit={onEditar ? () => onEditar(r.id) : undefined}
          onDelete={() => borrar(r)}
        />
      ),
    } as Col<F006Registro>] : []),
  ], [refs, maqs, personas, onEditar, admin])

  const renderDetail = (r: F006Registro) => (
    <div className="detalle">
      <div style={{ gridColumn: '1 / -1' }} className="muted">
        Operario: <b>{personaName(r.operario_id)}</b> · Empacador: <b>{personaName(r.empacador_id)}</b> · Registrado: {hhmm(r.creado_en)}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <h4>Mediciones producto (mm)</h4>
        <div className="emb-grid">
          <span className="emb-chip">Altura vaso: <b>{r.altura_vaso || '—'}</b></span>
          <span className="emb-chip">Diámetro superior: <b>{r.diametro_superior || '—'}</b></span>
          <span className="emb-chip">Grueso Rim: <b>{r.grueso_rim || '—'}</b></span>
          <span className="emb-chip">Diámetro inferior: <b>{r.diametro_inferior || '—'}</b></span>
        </div>
      </div>
      <div>
        <h4>Pruebas de filtración</h4>
        {r.filtraciones.length === 0 && <p className="muted">Sin pruebas.</p>}
        {r.filtraciones.map((f) => (
          <div key={f.id} className="detalle-filt">
            <strong>{opts ? label(opts.tipos_prueba_f006, f.tipo_prueba) : f.tipo_prueba}</strong>
            {' · '}{opts ? label(opts.tipos_material_f006, f.tipo_material) : f.tipo_material}
            {' · montada '}{hhmm(f.hora_montaje)} · muestra {f.cantidad_muestra}
            {f.estado === 'finalizada'
              ? <> · <span className="tag-ok">cumple {f.cantidad_cumple}</span> / <span className="tag-bad">no cumple {f.cantidad_nocumple}</span></>
              : <> · <span className="tag-warn">en proceso</span></>}
            {(f.goteo_vaso_tapa || f.tapa_centrada) && <span className="muted"> · goteo {f.goteo_vaso_tapa || '—'} · tapa centrada {f.tapa_centrada || '—'}</span>}
            {f.comentario ? <span className="muted"> — {f.comentario}</span> : null}
          </div>
        ))}
      </div>
      <div>
        <h4>Embalaje</h4>
        <div className="emb-grid">
          {r.embalaje.map((e) => (
            <span key={e.item} className="emb-chip">
              {opts ? label(opts.embalaje_f006, e.item) : e.item}: <b className={e.resultado === 'C' ? 'tag-ok' : e.resultado === 'NC' ? 'tag-bad' : 'muted'}>{e.resultado}</b>
            </span>
          ))}
          {r.embalaje.length === 0 && <span className="muted">Sin embalaje registrado.</span>}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {onBack && <div className="btn-row" style={{ marginBottom: 6 }}><button className="btn btn-ghost" onClick={onBack}>← Reportes</button></div>}
      <div className="section-title">
        <span className="code">F-006</span>
        <h2>Registros de proceso vasos</h2>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', minHeight: 40 }} onClick={cargar}>↻ Actualizar</button>
      </div>
      {cargando ? <p className="muted">Cargando…</p> : (
        <FilterTable columns={columns} rows={rows} getKey={(r) => r.id} renderDetail={renderDetail} />
      )}
    </div>
  )
}
