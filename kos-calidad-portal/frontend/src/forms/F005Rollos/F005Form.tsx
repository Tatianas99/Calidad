import { useEffect, useState } from 'react'
import { apiGet, apiMutate } from '../../lib/api'
import { useDraft } from '../../lib/draft'
import { uuid } from '../../lib/uuid'
import { getUser } from '../../lib/auth'
import { Field } from '../../components/Field'
import OptionButtons from '../../components/OptionButtons'
import ChecklistCNCNA from '../../components/ChecklistCNCNA'
import ComboBox from '../../components/ComboBox'
import { matchKeywords } from '../../lib/fuzzy'
import type { F158Config, F005Registro, ProveedorPapel } from '../../lib/types'

const hoy = () => new Date().toISOString().slice(0, 10)
const ESTADO_RES = ['C', 'NC', 'N/A']
const ESTADO_ITEMS = [
  { value: 'dinas', label: 'Prueba de dinas' },
  { value: 'alcohol', label: 'Prueba de alcohol' },
  { value: 'lapiz', label: 'Prueba de lápiz' },
  { value: 'armado', label: 'Prueba de armado' },
  { value: 'inocuidad', label: 'Inocuidad' },
]
// Procesos que aplican en F-005 (subconjunto del F-158).
const PROCESOS_F005 = ['slitter', 'flexo', 'troquelado']

type Entrada = {
  localId: string
  editId?: string
  fecha?: string          // solo admin puede editarla
  proceso?: string
  maquina?: string
  lote?: string
  material?: string
  ancho?: string
  calibre?: string        // opción o 'otro'
  calibreOtro?: string
  kg?: string
  estado: Record<string, string>
  proveedor?: string
  observaciones?: string
  createdAt: number
}
type State = { entradas: Entrada[]; seleccionadoId?: string }

export default function F005Form({
  onExit, editarId, onEditarConsumido,
}: {
  onExit: () => void
  editarId?: string | null
  onEditarConsumido?: () => void
}) {
  const [config, setConfig] = useState<F158Config | null>(null)
  const [proveedores, setProveedores] = useState<string[]>([])
  const [guardados, setGuardados] = useState<F005Registro[]>([])
  const [verGuardados, setVerGuardados] = useState(false)
  const [busqGuardados, setBusqGuardados] = useState('')
  const [msg, setMsg] = useState('')
  const user = getUser()
  const admin = user?.rol === 'admin'

  const [st, setSt] = useDraft<State>('draft_f005_v1', { entradas: [] })

  const cargarGuardados = () =>
    apiGet<F005Registro[]>(`/f005/registros?mios=true&fecha=${hoy()}`).then(setGuardados).catch(() => {})

  useEffect(() => {
    apiGet<F158Config>('/f158/config').then(setConfig).catch(() => {})
    apiGet<ProveedorPapel[]>('/catalogos/proveedores-papel').then((ps) => setProveedores(ps.map((p) => p.nombre))).catch(() => {})
    cargarGuardados()
  }, [])

  useEffect(() => {
    if (!editarId || !config) return
    apiGet<F005Registro>(`/f005/registros/${editarId}`)
      .then((r) => editarGuardado(r))
      .catch(() => {})
      .finally(() => onEditarConsumido?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId, config])

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2800) }

  const selected = st.entradas.find((e) => e.localId === st.seleccionadoId)
  const patch = (id: string, p: Partial<Entrada>) =>
    setSt((s) => ({ ...s, entradas: s.entradas.map((e) => (e.localId === id ? { ...e, ...p } : e)) }))
  const upd = (p: Partial<Entrada>) => selected && patch(selected.localId, p)

  function agregar() {
    const nueva: Entrada = { localId: uuid(), estado: {}, fecha: hoy(), createdAt: Date.now() }
    setSt((s) => ({ ...s, entradas: [...s.entradas, nueva], seleccionadoId: nueva.localId }))
  }
  function quitar(id: string) {
    if (!window.confirm('¿Quitar esta entrada? (si no la has guardado, se pierde lo capturado)')) return
    setSt((s) => {
      const entradas = s.entradas.filter((e) => e.localId !== id)
      return { ...s, entradas, seleccionadoId: s.seleccionadoId === id ? entradas[0]?.localId : s.seleccionadoId }
    })
  }

  function editarGuardado(r: F005Registro) {
    const existente = st.entradas.find((e) => e.editId === r.id)
    if (existente) { setSt((s) => ({ ...s, seleccionadoId: existente.localId })); return }
    const cal = r.calibre && config?.calibres.includes(r.calibre) ? r.calibre : (r.calibre ? 'otro' : undefined)
    const estado: Record<string, string> = {}
    if (r.estado_dinas) estado.dinas = r.estado_dinas
    if (r.estado_alcohol) estado.alcohol = r.estado_alcohol
    if (r.estado_lapiz) estado.lapiz = r.estado_lapiz
    if (r.estado_armado) estado.armado = r.estado_armado
    if (r.estado_inocuidad) estado.inocuidad = r.estado_inocuidad
    const nueva: Entrada = {
      localId: uuid(), editId: r.id, fecha: r.fecha, proceso: r.proceso ?? undefined, maquina: r.maquina ?? undefined,
      lote: r.lote, material: r.material ?? undefined,
      ancho: r.ancho ?? undefined, calibre: cal, calibreOtro: cal === 'otro' ? (r.calibre ?? undefined) : undefined,
      kg: r.kg ?? undefined, estado, proveedor: r.proveedor ?? undefined,
      observaciones: r.observaciones ?? undefined, createdAt: Date.now(),
    }
    setSt((s) => ({ ...s, entradas: [...s.entradas, nueva], seleccionadoId: nueva.localId }))
  }

  async function guardar(e: Entrada) {
    if (!e.lote || !e.lote.trim()) { flash('El lote es obligatorio'); return }
    const body = {
      proceso: e.proceso ?? null,
      maquina: e.maquina ?? null,
      lote: e.lote.trim(),
      material: e.material ?? null,
      ancho: e.ancho ?? null,
      calibre: e.calibre === 'otro' ? (e.calibreOtro ?? null) : (e.calibre ?? null),
      kg: e.kg ?? null,
      estado_dinas: e.estado.dinas ?? null,
      estado_alcohol: e.estado.alcohol ?? null,
      estado_lapiz: e.estado.lapiz ?? null,
      estado_armado: e.estado.armado ?? null,
      estado_inocuidad: e.estado.inocuidad ?? null,
      proveedor: e.proveedor ?? null,
      observaciones: e.observaciones ?? null,
      ...(admin ? { fecha: e.fecha || hoy() } : {}),
    }
    const r = e.editId
      ? await apiMutate('PUT', `/f005/registros/${e.editId}`, body)
      : await apiMutate('POST', '/f005/registros', { id: e.localId, ...body })
    setSt((s) => {
      const entradas = s.entradas.filter((x) => x.localId !== e.localId)
      return { ...s, entradas, seleccionadoId: s.seleccionadoId === e.localId ? entradas[0]?.localId : s.seleccionadoId }
    })
    cargarGuardados()
    flash(r.ok ? (e.editId ? 'Registro actualizado ✔' : 'Registro guardado ✔') : 'Guardado (pendiente de sincronizar)')
  }

  const nombre = (r: F005Registro) => `Rollo - ${r.lote}`
  const guardadosFiltrados = guardados.filter((r) => matchKeywords(busqGuardados, nombre(r) + ' ' + (r.material ?? '')))

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <button className="btn btn-ghost" onClick={onExit}>← Ir al inicio</button>
      </div>
      <div className="section-title">
        <span className="code">F-005</span>
        <h2>Liberación de rollos</h2>
        {user && <span className="muted" style={{ marginLeft: 'auto' }}>Responsable: <strong>{user.nombre}</strong> · {new Date().toLocaleDateString('es-CO')}</span>}
      </div>

      <div className="f006-layout">
        <aside className="side">
          <button className="add" onClick={agregar}>AGREGAR +</button>
          <h4>Entradas abiertas ({st.entradas.length})</h4>
          <div className="prod-list">
            {st.entradas.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Presiona AGREGAR + para iniciar un rollo.</p>}
            {st.entradas.map((e) => (
              <button
                key={e.localId}
                className={'prod-item' + (e.localId === st.seleccionadoId ? ' sel' : '')}
                onClick={() => setSt((s) => ({ ...s, seleccionadoId: e.localId }))}
              >
                <span className="pt">{e.lote ? `Rollo - ${e.lote}` : 'Rollo nuevo'}</span>
                <span className="pm">{e.material ?? 'sin material'}{e.editId ? ' · editando' : ' · sin guardar'}</span>
                <span className="quitar-x" title="Quitar" onClick={(ev) => { ev.stopPropagation(); quitar(e.localId) }}>×</span>
              </button>
            ))}
          </div>

          <div className="saved-div" onClick={() => setVerGuardados((v) => !v)}>
            <span>{verGuardados ? '▾' : '▸'} Guardados hoy ({guardados.length})</span>
            <span className="saved-line" />
          </div>
          {verGuardados && (
            <div className="saved-list">
              <input className="filt-search" style={{ marginBottom: 6 }} placeholder="Buscar por palabras clave…"
                value={busqGuardados} onChange={(e) => setBusqGuardados(e.target.value)} />
              {guardados.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Aún no has guardado rollos hoy.</p>}
              {guardados.length > 0 && guardadosFiltrados.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Sin coincidencias.</p>}
              {guardadosFiltrados.map((r) => (
                <div key={r.id} className="saved-item">
                  <div>
                    <strong>{nombre(r)}</strong>
                    <div className="muted">{new Date(r.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}{r.material ? ` · ${r.material}` : ''}</div>
                  </div>
                  <button className="btn btn-ghost pill-btn" onClick={() => editarGuardado(r)}>Editar</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section>
          {!selected ? (
            <div className="panel prod-empty">
              <p>Selecciona una entrada o presiona <strong>AGREGAR +</strong> para liberar un rollo.</p>
              <button className="btn btn-primary" onClick={agregar}>AGREGAR +</button>
            </div>
          ) : !config ? (
            <div className="panel"><p className="muted">Cargando…</p></div>
          ) : (
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>{selected.lote ? `Rollo - ${selected.lote}` : 'Rollo nuevo'}</h3>

              <Field label="Proceso">
                <OptionButtons
                  options={config.procesos.filter((p) => PROCESOS_F005.includes(p.key)).map((p) => ({ value: p.key, label: p.label }))}
                  value={selected.proceso}
                  onChange={(v) => upd({ proceso: v, maquina: undefined })}
                />
              </Field>
              {(() => {
                const maqs = config.procesos.find((p) => p.key === selected.proceso)?.maquinas ?? []
                return maqs.length > 0 ? (
                  <Field label="Máquina">
                    <OptionButtons options={maqs.map((m) => ({ value: m, label: m }))} value={selected.maquina} onChange={(v) => upd({ maquina: v })} />
                  </Field>
                ) : null
              })()}

              <div className="row">
                {admin && (
                  <Field label="Fecha" hint="editable (solo admin)">
                    <input type="date" value={selected.fecha ?? hoy()} onChange={(e) => upd({ fecha: e.target.value })} />
                  </Field>
                )}
                <Field label="Lote" hint="escribir">
                  <input value={selected.lote ?? ''} onChange={(e) => upd({ lote: e.target.value })} />
                </Field>
              </div>

              <Field label="Material">
                <OptionButtons options={config.materiales.map((m) => ({ value: m, label: m }))} value={selected.material} onChange={(v) => upd({ material: v })} />
              </Field>

              <div className="row">
                <Field label="Ancho" hint="escribir">
                  <input value={selected.ancho ?? ''} onChange={(e) => upd({ ancho: e.target.value })} />
                </Field>
                <Field label="Kg" hint="escribir">
                  <input value={selected.kg ?? ''} onChange={(e) => upd({ kg: e.target.value })} />
                </Field>
              </div>

              <Field label="Calibre">
                <OptionButtons
                  options={[...config.calibres.map((c) => ({ value: c, label: c })), { value: 'otro', label: 'Otro ¿cuál?' }]}
                  value={selected.calibre} onChange={(v) => upd({ calibre: v })}
                />
                {selected.calibre === 'otro' && (
                  <input style={{ marginTop: 6 }} placeholder="¿Cuál?" value={selected.calibreOtro ?? ''} onChange={(e) => upd({ calibreOtro: e.target.value })} />
                )}
              </Field>

              <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
              <h3 style={{ marginTop: 0 }}>Estado</h3>
              <ChecklistCNCNA items={ESTADO_ITEMS} resultados={ESTADO_RES} value={selected.estado}
                onChange={(item, res) => upd({ estado: { ...selected.estado, [item]: res } })} />

              <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
              <div className="row">
                <Field label="Proveedor" hint="buscar o escribir">
                  <ComboBox value={selected.proveedor ?? ''} onChange={(v) => upd({ proveedor: v })} options={proveedores} placeholder="Buscar o escribir proveedor…" />
                </Field>
                <Field label="Responsable" hint="usuario en sesión">
                  <input type="text" value={user?.nombre ?? ''} readOnly tabIndex={-1} style={{ background: 'var(--surface-2)' }} />
                </Field>
              </div>
              <Field label="Observaciones">
                <textarea value={selected.observaciones ?? ''} onChange={(e) => upd({ observaciones: e.target.value })} />
              </Field>

              {(!selected.lote || !selected.lote.trim()) && <p className="tag-bad">⚠ El lote es obligatorio.</p>}
              <div className="btn-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" disabled={!selected.lote || !selected.lote.trim()} onClick={() => guardar(selected)}>
                  {selected.editId ? 'Actualizar registro' : 'Guardar registro'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
