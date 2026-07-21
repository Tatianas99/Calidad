import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api'
import FilterTable, { type Col } from '../components/FilterTable'
import type { Referencia, Maquina, Persona, Opciones, F006Registro, Option } from '../lib/types'

const label = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v
const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''

export default function RegistrosF006() {
  const [rows, setRows] = useState<F006Registro[]>([])
  const [refs, setRefs] = useState<Referencia[]>([])
  const [maqs, setMaqs] = useState<Maquina[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [opts, setOpts] = useState<Opciones | null>(null)
  const [cargando, setCargando] = useState(true)

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

  const refName = (id: number) => {
    const r = refs.find((x) => x.id === id)
    return r ? (r.descripcion ? `${r.codigo} ${r.descripcion}` : r.codigo) : `#${id}`
  }
  const maqName = (id: number) => maqs.find((m) => m.id === id)?.nombre ?? `#${id}`
  const personaName = (id?: number | null) => (id ? personas.find((p) => p.id === id)?.nombre ?? `#${id}` : '—')

  const columns: Col<F006Registro>[] = useMemo(() => [
    { key: 'fecha', label: 'Fecha', value: (r) => r.fecha },
    { key: 'turno', label: 'Turno', value: (r) => `T${r.turno}` },
    { key: 'maquina', label: 'Máquina', value: (r) => maqName(r.maquina_id) },
    { key: 'referencia', label: 'Referencia', value: (r) => refName(r.referencia_id) },
    { key: 'pruebas', label: 'Pruebas', value: (r) => String(r.filtraciones.length) },
    { key: 'auxiliar', label: 'Auxiliar', value: (r) => personaName(r.auxiliar_id) },
    { key: 'operario', label: 'Operario', value: (r) => personaName(r.operario_id) },
    { key: 'empacador', label: 'Empacador', value: (r) => personaName(r.empacador_id) },
    { key: 'hora', label: 'Registrado', value: (r) => hhmm(r.creado_en) },
  ], [refs, maqs, personas])

  const renderDetail = (r: F006Registro) => (
    <div className="detalle">
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
