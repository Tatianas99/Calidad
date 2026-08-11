import { useEffect, useRef, useState } from 'react'
import { apiGet, apiMutate } from '../../lib/api'
import { useDraft } from '../../lib/draft'
import { uuid } from '../../lib/uuid'
import { getUser } from '../../lib/auth'
import { Field } from '../../components/Field'
import ChecklistCNCNA from '../../components/ChecklistCNCNA'
import OptionButtons from '../../components/OptionButtons'
import ComboBox from '../../components/ComboBox'
import OPSearch from '../../components/OPSearch'
import SearchSelect from '../../components/SearchSelect'
import type { Referencia, Maquina, Persona, Opciones, Option, F006Registro } from '../../lib/types'

const FILT_MS = 20 * 60 * 1000 // 20 minutos
type Tab = 'pe' | 'filt' | 'firmas'

type LocalFiltracion = {
  id: string
  tipo_prueba: string
  tipo_material: string
  cantidad_muestra: number
  montadaEnMs: number
  estado: 'en_proceso' | 'finalizada'
  cantidad_cumple?: number
  cantidad_nocumple?: number
  goteo_vaso_tapa?: string
  tapa_centrada?: string
  comentario?: string
}
type Producto = {
  registroId: string
  orden_produccion?: string
  referencia_texto?: string  // referencia traída de la OP
  marca?: string
  altura_vaso?: string
  diametro_superior?: string
  diametro_inferior?: string
  grueso_rim?: string
  fecha: string
  maquina?: string        // máquina (buscar/escribir)
  turno?: number
  guardado: boolean
  finalizado?: boolean
  embalaje: Record<string, string>
  filtraciones: LocalFiltracion[]
  operario_id?: number
  empacador_id?: number
  createdAt: number
}
type State = {
  productos: Producto[]
  seleccionadoId?: string
}

const hoy = () => new Date().toISOString().slice(0, 10)
const labelOf = (opts: Option[], v?: string) => opts.find((o) => o.value === v)?.label ?? v ?? ''
const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

export default function F006Form({
  onExit, editarId, onEditarConsumido,
}: {
  onExit: () => void
  editarId?: string | null
  onEditarConsumido?: () => void
}) {
  const [refs, setRefs] = useState<Referencia[]>([])
  const [maqs, setMaqs] = useState<Maquina[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [opts, setOpts] = useState<Opciones | null>(null)
  const [msg, setMsg] = useState('')
  const [now, setNow] = useState(Date.now())

  const [st, setSt] = useDraft<State>('draft_f006_v3', { productos: [] })
  const stRef = useRef(st)
  stRef.current = st
  const embTimers = useRef<Record<string, number>>({})

  useEffect(() => {
    apiGet<Referencia[]>('/catalogos/referencias').then(setRefs).catch(() => {})
    apiGet<Maquina[]>('/catalogos/maquinas').then(setMaqs).catch(() => {})
    apiGet<Persona[]>('/catalogos/personas').then(setPersonas).catch(() => {})
    apiGet<Opciones>('/catalogos/opciones').then(setOpts).catch(() => {})
  }, [])

  // Edición pedida desde "Ver registros F-006": recarga el registro como producto
  // editable del turno (reutiliza los mismos PUT de cabecera/embalaje/firmas).
  useEffect(() => {
    if (!editarId) return
    apiGet<F006Registro>(`/f006/registros/${editarId}`)
      .then((r) => {
        setSt((s) => {
          if (s.productos.some((p) => p.registroId === r.id)) return { ...s, seleccionadoId: r.id }
          const prod: Producto = {
            registroId: r.id,
            orden_produccion: r.orden_produccion ?? undefined,
            referencia_texto: r.referencia_texto ?? (r.referencia_id ? refLabel(r.referencia_id) : undefined),
            marca: r.marca ?? undefined,
            altura_vaso: r.altura_vaso ?? undefined,
            diametro_superior: r.diametro_superior ?? undefined,
            diametro_inferior: r.diametro_inferior ?? undefined,
            grueso_rim: r.grueso_rim ?? undefined,
            fecha: r.fecha,
            maquina: r.maquina_texto ?? (r.maquina_id ? maqs.find((m) => m.id === r.maquina_id)?.nombre : undefined),
            turno: r.turno,
            guardado: true,
            embalaje: Object.fromEntries(r.embalaje.map((e) => [e.item, e.resultado])),
            filtraciones: r.filtraciones.map((f) => ({
              id: f.id,
              tipo_prueba: f.tipo_prueba,
              tipo_material: f.tipo_material,
              cantidad_muestra: f.cantidad_muestra,
              montadaEnMs: new Date(f.hora_montaje).getTime(),
              estado: f.estado,
              cantidad_cumple: f.cantidad_cumple ?? undefined,
              cantidad_nocumple: f.cantidad_nocumple ?? undefined,
              goteo_vaso_tapa: f.goteo_vaso_tapa ?? undefined,
              tapa_centrada: f.tapa_centrada ?? undefined,
              comentario: f.comentario ?? undefined,
            })),
            operario_id: r.operario_id ?? undefined,
            empacador_id: r.empacador_id ?? undefined,
            createdAt: Date.now(),
          }
          return { ...s, productos: [...s.productos, prod], seleccionadoId: r.id }
        })
      })
      .catch(() => {})
      .finally(() => onEditarConsumido?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2500) }
  const feedback = (queued: boolean) => flash(queued ? 'Guardado (pendiente de sincronizar)' : 'Guardado')

  // Resuelve una referencia_id vieja a texto (solo respaldo al editar registros previos).
  const refLabel = (id?: number) => {
    const r = refs.find((x) => x.id === id)
    return r ? (r.descripcion ? `${r.codigo} · ${r.descripcion}` : r.codigo) : ''
  }
  // Etiqueta del producto: referencia (de la OP) + marca (usar en todas las secciones).
  const prodLabel = (p: { referencia_texto?: string; marca?: string }) =>
    (p.referencia_texto || 'Producto nuevo') + (p.marca ? ` ${p.marca}` : '')

  const mapProd = (id: string, fn: (p: Producto) => Producto) =>
    setSt((s) => ({ ...s, productos: s.productos.map((p) => (p.registroId === id ? fn(p) : p)) }))
  const patchProd = (id: string, patch: Partial<Producto>) => mapProd(id, (p) => ({ ...p, ...patch }))

  const selected = st.productos.find((p) => p.registroId === st.seleccionadoId)

  function agregarProducto() {
    const nuevo: Producto = {
      registroId: uuid(), fecha: hoy(), guardado: false, embalaje: {}, filtraciones: [], createdAt: Date.now(),
    }
    setSt((s) => ({ ...s, productos: [...s.productos, nuevo], seleccionadoId: nuevo.registroId }))
  }

  function quitarProducto(id: string) {
    if (!window.confirm('¿Quitar este producto de la lista? (si ya se guardó, los datos permanecen en la base)')) return
    setSt((s) => {
      const productos = s.productos.filter((p) => p.registroId !== id)
      const seleccionadoId = s.seleccionadoId === id ? productos[0]?.registroId : s.seleccionadoId
      return { ...s, productos, seleccionadoId }
    })
  }

  async function maybeGuardarCabecera(prod: Producto) {
    if (!prod.referencia_texto || !prod.referencia_texto.trim() || !prod.maquina || !prod.turno) return
    const body = {
      orden_produccion: prod.orden_produccion ?? null,
      referencia_texto: prod.referencia_texto ?? null, marca: prod.marca ?? null, fecha: prod.fecha,
      maquina_texto: prod.maquina ?? null, turno: prod.turno,
      altura_vaso: prod.altura_vaso ?? null, diametro_superior: prod.diametro_superior ?? null,
      diametro_inferior: prod.diametro_inferior ?? null, grueso_rim: prod.grueso_rim ?? null,
    }
    if (!prod.guardado) {
      patchProd(prod.registroId, { guardado: true }) // optimista (POST idempotente)
      const r = await apiMutate('POST', '/f006/registros', { id: prod.registroId, ...body })
      feedback(!r.ok)
      programarGuardarEmbalaje(prod.registroId)
    } else {
      const r = await apiMutate('PUT', `/f006/registros/${prod.registroId}`, body)
      feedback(!r.ok)
    }
  }

  function programarGuardarEmbalaje(prodId: string) {
    window.clearTimeout(embTimers.current[prodId])
    embTimers.current[prodId] = window.setTimeout(() => {
      const p = stRef.current.productos.find((x) => x.registroId === prodId)
      if (!p || !p.guardado) return
      const items = Object.entries(p.embalaje).map(([item, resultado]) => ({ item, resultado }))
      apiMutate('PUT', `/f006/registros/${prodId}/embalaje`, { items })
    }, 800)
  }

  function cambiarCabecera(prod: Producto, patch: Partial<Producto>) {
    patchProd(prod.registroId, patch)
    maybeGuardarCabecera({ ...prod, ...patch })
  }

  function cambiarEmbalaje(prodId: string, item: string, resultado: string) {
    mapProd(prodId, (p) => ({ ...p, embalaje: { ...p.embalaje, [item]: resultado } }))
    programarGuardarEmbalaje(prodId)
  }

  async function montarFiltracion(prodId: string, tp: string, tm: string, cant: number) {
    const id = uuid()
    const nueva: LocalFiltracion = {
      id, tipo_prueba: tp, tipo_material: tm, cantidad_muestra: cant,
      montadaEnMs: Date.now(), estado: 'en_proceso',
    }
    mapProd(prodId, (p) => ({ ...p, filtraciones: [...p.filtraciones, nueva] }))
    const r = await apiMutate('POST', `/f006/registros/${prodId}/filtracion`, {
      id, tipo_prueba: tp, tipo_material: tm, cantidad_muestra: cant,
    })
    feedback(!r.ok)
  }

  async function registrarResultado(prodId: string, filt: LocalFiltracion, cumple: number, goteo: string, tapa: string, comentario: string) {
    const nocumple = filt.cantidad_muestra - cumple
    mapProd(prodId, (p) => ({
      ...p,
      filtraciones: p.filtraciones.map((f) =>
        f.id === filt.id ? { ...f, estado: 'finalizada', cantidad_cumple: cumple, cantidad_nocumple: nocumple, goteo_vaso_tapa: goteo, tapa_centrada: tapa, comentario } : f,
      ),
    }))
    const r = await apiMutate('PATCH', `/f006/filtracion/${filt.id}`, {
      cantidad_cumple: cumple, cantidad_nocumple: nocumple, goteo_vaso_tapa: goteo, tapa_centrada: tapa, comentario,
    })
    feedback(!r.ok)
  }

  async function finalizarProducto(prodId: string) {
    const p = stRef.current.productos.find((x) => x.registroId === prodId)
    if (!p) return
    if (!p.guardado) await maybeGuardarCabecera(p)
    const r = await apiMutate('PUT', `/f006/registros/${prodId}/firmas`, {
      operario_id: p.operario_id, empacador_id: p.empacador_id,
    })
    // Al finalizar, el producto se retira de la lista de activos del turno
    // (ya quedó guardado; se consulta en "Ver registros F-006").
    setSt((s) => {
      const productos = s.productos.filter((x) => x.registroId !== prodId)
      const seleccionadoId = s.seleccionadoId === prodId ? productos[0]?.registroId : s.seleccionadoId
      return { ...s, productos, seleccionadoId }
    })
    flash(r.ok ? 'Registro finalizado y archivado ✔' : 'Finalizado (pendiente de sincronizar)')
  }

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <button className="btn btn-ghost" onClick={onExit}>← Ir al inicio</button>
      </div>
      <div className="section-title">
        <span className="code">F-006</span>
        <h2>Ruta control proceso vasos — Turno</h2>
      </div>

      <div className="f006-layout">
        <aside className="side">
          <button className="add" onClick={agregarProducto}>AGREGAR +</button>
          <h4>Productos del turno ({st.productos.length})</h4>
          <div className="prod-list">
            {st.productos.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Aún no hay productos.</p>}
            {st.productos.map((p) => {
              const enProceso = p.filtraciones.filter((f) => f.estado === 'en_proceso')
              const listas = enProceso.filter((f) => now - f.montadaEnMs >= FILT_MS)
              return (
                <button
                  key={p.registroId}
                  className={'prod-item' + (p.registroId === st.seleccionadoId ? ' sel' : '')}
                  onClick={() => setSt((s) => ({ ...s, seleccionadoId: p.registroId }))}
                >
                  <span className="pt">{prodLabel(p)}</span>
                  <span className="pm">
                    {p.maquina || 'Sin máquina'} · {p.turno ? `T${p.turno}` : 'sin turno'} · {p.filtraciones.length} prueba(s){p.guardado ? '' : ' · sin guardar'}
                  </span>
                  {listas.length > 0 ? (
                    <span className="prod-alert urgente">⏱ {listas.length} por registrar</span>
                  ) : enProceso.length > 0 ? (
                    <span className="prod-alert">{enProceso.length} en proceso</span>
                  ) : null}
                  <span
                    className="quitar-x"
                    title="Quitar de la lista"
                    onClick={(e) => { e.stopPropagation(); quitarProducto(p.registroId) }}
                  >×</span>
                </button>
              )
            })}
          </div>
        </aside>

        <section>
          {!selected ? (
            <div className="panel prod-empty">
              <p>Selecciona un producto o presiona <strong>AGREGAR +</strong> para crear uno nuevo.</p>
              <button className="btn btn-primary" onClick={agregarProducto}>AGREGAR +</button>
            </div>
          ) : (
            <ProductoDetalle
              key={selected.registroId}
              prod={selected}
              maqs={maqs}
              personas={personas}
              opts={opts}
              now={now}
              onCabecera={(patch) => cambiarCabecera(selected, patch)}
              onPatch={(patch) => patchProd(selected.registroId, patch)}
              onEmbalaje={(item, r) => cambiarEmbalaje(selected.registroId, item, r)}
              onMontar={(tp, tm, c) => montarFiltracion(selected.registroId, tp, tm, c)}
              onResultado={(f, c, goteo, tapa, com) => registrarResultado(selected.registroId, f, c, goteo, tapa, com)}
              onFirmas={(patch) => patchProd(selected.registroId, patch)}
              onFinalizar={() => finalizarProducto(selected.registroId)}
            />
          )}
        </section>
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}

function ProductoDetalle({
  prod, maqs, personas, opts, now, onCabecera, onPatch, onEmbalaje, onMontar, onResultado, onFirmas, onFinalizar,
}: {
  prod: Producto
  maqs: Maquina[]
  personas: Persona[]
  opts: Opciones | null
  now: number
  onCabecera: (patch: Partial<Producto>) => void
  onPatch: (patch: Partial<Producto>) => void
  onEmbalaje: (item: string, resultado: string) => void
  onMontar: (tp: string, tm: string, cant: number) => void
  onResultado: (f: LocalFiltracion, cumple: number, goteo: string, tapa: string, comentario: string) => void
  onFirmas: (patch: Partial<Producto>) => void
  onFinalizar: () => void
}) {
  const [tab, setTab] = useState<Tab>('pe')
  const admin = getUser()?.rol === 'admin'
  const cabeceraCompleta = !!(prod.referencia_texto && prod.referencia_texto.trim() && prod.maquina && prod.turno)
  const faltantesEmb = opts ? opts.embalaje_f006.filter((o) => !prod.embalaje[o.value]) : []

  const firmasFaltan: string[] = []
  if (!prod.operario_id) firmasFaltan.push('Operario')
  if (!prod.empacador_id) firmasFaltan.push('Empacador')
  const puedeFinalizar = faltantesEmb.length === 0 && firmasFaltan.length === 0

  return (
    <div>
      <h3 className="prod-title">{prod.referencia_texto || 'Producto nuevo'}{prod.marca ? ` ${prod.marca}` : ''}</h3>

      <div className="tabbar">
        <button className={'tab' + (tab === 'pe' ? ' active' : '')} onClick={() => setTab('pe')}>
          Producto y embalaje{faltantesEmb.length > 0 && <span className="warn-badge">{faltantesEmb.length}</span>}
        </button>
        <button className={'tab' + (tab === 'filt' ? ' active' : '')} onClick={() => setTab('filt')}>
          Pruebas de filtración
        </button>
        <button className={'tab' + (tab === 'firmas' ? ' active' : '')} onClick={() => setTab('firmas')}>
          Firmas
        </button>
      </div>

      {tab === 'pe' && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Producto</h3>
          <Field label="Orden de producción">
            <OPSearch
              value={prod.orden_produccion ?? ''}
              onChange={(v) => onPatch({ orden_produccion: v })}
              onResolve={(o) => onCabecera({ referencia_texto: o.referencia, marca: o.marca })}
            />
          </Field>
          <div className="row">
            <Field label="Referencia">
              <input value={prod.referencia_texto ?? ''} onChange={(e) => onPatch({ referencia_texto: e.target.value })} onBlur={() => onCabecera({})} placeholder="Se autollena al elegir la OP" />
            </Field>
            <Field label="Marca">
              <input value={prod.marca ?? ''} onChange={(e) => onPatch({ marca: e.target.value })} onBlur={() => onCabecera({})} placeholder="Se autollena al elegir la OP" />
            </Field>
          </div>
          <div className="row">
            <Field label="Fecha" hint={admin ? 'editable (solo admin)' : 'día actual'}>
              {admin
                ? <input type="date" value={prod.fecha} onChange={(e) => onCabecera({ fecha: e.target.value })} />
                : <input type="text" value={new Date(prod.fecha + 'T00:00:00').toLocaleDateString('es-CO')} readOnly tabIndex={-1} style={{ background: 'var(--surface-2)' }} />}
            </Field>
            <Field label="Máquina" hint="buscar o escribir">
              <ComboBox value={prod.maquina ?? ''} onChange={(v) => onCabecera({ maquina: v })} options={maqs.map((m) => m.nombre)} placeholder="Buscar o escribir máquina…" />
            </Field>
            <Field label="Turno">
              <select value={prod.turno ?? ''} onChange={(e) => onCabecera({ turno: Number(e.target.value) })}>
                <option value="">Seleccionar…</option>
                {(opts?.turnos ?? [1, 2, 3]).map((t) => <option key={t} value={t}>Turno {t}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0 14px' }} />
          <h3 style={{ marginTop: 0 }}>Revisión de embalaje <span className="hint">(todos los ítems son obligatorios)</span></h3>
          {opts && (
            <ChecklistCNCNA items={opts.embalaje_f006} resultados={opts.resultados} value={prod.embalaje} onChange={onEmbalaje} />
          )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
          <h3 style={{ marginTop: 0 }}>Mediciones producto <span className="hint">(en mm)</span></h3>
          <div className="row">
            <Field label="Altura vaso">
              <input value={prod.altura_vaso ?? ''} onChange={(e) => onPatch({ altura_vaso: e.target.value })} onBlur={() => onCabecera({})} />
            </Field>
            <Field label="Diámetro superior">
              <input value={prod.diametro_superior ?? ''} onChange={(e) => onPatch({ diametro_superior: e.target.value })} onBlur={() => onCabecera({})} />
            </Field>
          </div>
          <div className="row">
            <Field label="Grueso Rim">
              <input value={prod.grueso_rim ?? ''} onChange={(e) => onPatch({ grueso_rim: e.target.value })} onBlur={() => onCabecera({})} />
            </Field>
            <Field label="Diámetro inferior">
              <input value={prod.diametro_inferior ?? ''} onChange={(e) => onPatch({ diametro_inferior: e.target.value })} onBlur={() => onCabecera({})} />
            </Field>
          </div>

          <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setTab('filt')}>Siguiente →</button>
          </div>
        </div>
      )}

      {tab === 'filt' && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Pruebas de filtración</h3>
          {!cabeceraCompleta && <p className="muted">Completa referencia, máquina y turno (pestaña anterior) para montar pruebas.</p>}
          {cabeceraCompleta && opts && <NuevaFiltracion opts={opts} onMontar={onMontar} />}
          {prod.filtraciones.length === 0 && cabeceraCompleta && <p className="muted">Aún no hay pruebas montadas.</p>}
          {prod.filtraciones.map((f) => (
            <FiltracionCard key={f.id} f={f} opts={opts} now={now} productoLabel={(prod.referencia_texto || '') + (prod.marca ? ` ${prod.marca}` : '')} onResultado={onResultado} />
          ))}
          <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setTab('firmas')}>Siguiente →</button>
          </div>
        </div>
      )}

      {tab === 'firmas' && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Firmas</h3>
          <div className="row">
            <Field label="Auxiliar de calidad">
              <input type="text" value={getUser()?.nombre ?? ''} readOnly tabIndex={-1} style={{ background: 'var(--surface-2)' }} />
            </Field>
            <Field label="Operario(a)">
              <SearchSelect
                items={personas.map((p) => ({ id: p.id, label: p.nombre }))}
                value={prod.operario_id}
                onChange={(id) => onFirmas({ operario_id: id })}
                placeholder="Buscar operario…"
              />
            </Field>
            <Field label="Empacador(a)">
              <SearchSelect
                items={personas.map((p) => ({ id: p.id, label: p.nombre }))}
                value={prod.empacador_id}
                onChange={(id) => onFirmas({ empacador_id: id })}
                placeholder="Buscar empacador…"
              />
            </Field>
          </div>

          {faltantesEmb.length > 0 && (
            <p className="tag-bad">
              ⚠ No se puede finalizar: faltan {faltantesEmb.length} ítem(s) del embalaje: {faltantesEmb.map((o) => o.label).join(', ')}.
              Complétalos en la pestaña «Producto y embalaje».
            </p>
          )}
          {faltantesEmb.length === 0 && firmasFaltan.length > 0 && (
            <p className="tag-bad">⚠ Falta seleccionar: {firmasFaltan.join(', ')}.</p>
          )}

          <button className="btn btn-primary" disabled={!puedeFinalizar} onClick={onFinalizar}>
            Finalizar registro
          </button>
          {prod.finalizado && <p className="tag-ok" style={{ marginBottom: 0 }}>✔ Registro finalizado.</p>}
        </div>
      )}
    </div>
  )
}

function NuevaFiltracion({ opts, onMontar }: { opts: Opciones; onMontar: (tp: string, tm: string, c: number) => void }) {
  const [tp, setTp] = useState('')
  const [tm, setTm] = useState('')
  const [cant, setCant] = useState('')

  const montar = () => {
    if (!tp || !tm || cant === '') return
    onMontar(tp, tm, Number(cant))
    setTp(''); setTm(''); setCant('')
  }

  return (
    <div className="filt" style={{ background: 'transparent' }}>
      <Field label="Tipo de prueba">
        <OptionButtons options={opts.tipos_prueba_f006} value={tp} onChange={setTp} />
      </Field>
      <Field label="Tipo de papel">
        <OptionButtons options={opts.tipos_material_f006} value={tm} onChange={setTm} />
      </Field>
      <Field label="Cantidad de muestra" hint="unidades montadas">
        <input type="number" min={0} inputMode="numeric" value={cant} onChange={(e) => setCant(e.target.value)} />
      </Field>
      <button className="btn btn-accent" disabled={!tp || !tm || cant === ''} onClick={montar}>
        Montar prueba
      </button>
    </div>
  )
}

function FiltracionCard({
  f, opts, now, productoLabel, onResultado,
}: {
  f: LocalFiltracion
  opts: Opciones | null
  now: number
  productoLabel: string
  onResultado: (f: LocalFiltracion, cumple: number, goteo: string, tapa: string, comentario: string) => void
}) {
  const [cumple, setCumple] = useState('')
  const [goteo, setGoteo] = useState('')
  const [tapa, setTapa] = useState('')
  const [comentario, setComentario] = useState('')
  const resOpts = (opts?.resultados ?? ['C', 'NC', 'N/A']).map((r) => ({ value: r, label: r }))

  const restante = FILT_MS - (now - f.montadaEnMs)
  const listo = restante <= 0
  const mm = Math.max(0, Math.floor(restante / 60000))
  const ss = Math.max(0, Math.floor((restante % 60000) / 1000))

  const cumpleNum = cumple === '' ? null : Number(cumple)
  const excede = cumpleNum !== null && cumpleNum > f.cantidad_muestra
  const invalido = cumpleNum === null || cumpleNum < 0 || excede
  const nocumpleCalc = cumpleNum === null || excede ? null : f.cantidad_muestra - cumpleNum

  const prueba = opts ? labelOf(opts.tipos_prueba_f006, f.tipo_prueba) : f.tipo_prueba
  const material = opts ? labelOf(opts.tipos_material_f006, f.tipo_material) : f.tipo_material

  return (
    <div className={'filt' + (f.estado === 'finalizada' ? ' fin' : '')}>
      <div className="head">
        <strong>{prueba} - {material} · {productoLabel}</strong>
        <span className={'badge ' + (f.estado === 'finalizada' ? 'fin' : 'proc')}>
          {f.estado === 'finalizada' ? 'Finalizada' : 'En proceso'}
        </span>
      </div>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        Montada a las {hhmm(f.montadaEnMs)} · Muestra: {f.cantidad_muestra}
      </p>

      {f.estado === 'en_proceso' ? (
        <>
          <p className={'timer' + (listo ? ' ready' : '')}>
            {listo ? 'Muestra lista (20 min cumplidos)' : `Faltan ${mm}:${String(ss).padStart(2, '0')} para leer`}
          </p>
          <div className="row">
            <Field label="Cumple (no filtra)" hint={`máximo ${f.cantidad_muestra}`}>
              <input
                type="number" min={0} max={f.cantidad_muestra} inputMode="numeric" value={cumple}
                onChange={(e) => setCumple(e.target.value)}
                style={excede ? { borderColor: 'var(--bad)', background: 'var(--bad-bg)' } : undefined}
              />
            </Field>
            <Field label="No cumple (filtra)" hint="calculado automáticamente">
              <input type="number" value={nocumpleCalc ?? ''} readOnly tabIndex={-1} style={{ background: 'var(--surface-2)' }} />
            </Field>
          </div>
          {excede && (
            <p className="tag-bad">La cantidad que cumple no puede ser mayor a la muestra ({f.cantidad_muestra}).</p>
          )}
          <div className="check-row">
            <span className="label">Goteo de vaso con tapa</span>
            <OptionButtons options={resOpts} value={goteo} onChange={setGoteo} />
          </div>
          <div className="check-row">
            <span className="label">Tapa centrada</span>
            <OptionButtons options={resOpts} value={tapa} onChange={setTapa} />
          </div>
          <Field label="Comentario">
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </Field>
          {(!goteo || !tapa) && <p className="hint">Selecciona Goteo de vaso con tapa y Tapa centrada.</p>}
          <button className="btn btn-primary" disabled={invalido || !goteo || !tapa} onClick={() => onResultado(f, Number(cumple), goteo, tapa, comentario)}>
            Registrar resultado
          </button>
        </>
      ) : (
        <p style={{ margin: 0 }}>
          <span className="tag-ok">Cumple: {f.cantidad_cumple}</span>{' · '}
          <span className="tag-bad">No cumple: {f.cantidad_nocumple}</span>
          {(f.goteo_vaso_tapa || f.tapa_centrada) && (
            <><br /><span className="muted">Goteo: {f.goteo_vaso_tapa || '—'} · Tapa centrada: {f.tapa_centrada || '—'}</span></>
          )}
          {f.comentario ? <><br /><span className="muted">{f.comentario}</span></> : null}
        </p>
      )}
    </div>
  )
}
