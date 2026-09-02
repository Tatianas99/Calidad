import { useEffect, useState } from 'react'
import { apiGet, apiMutate, apiSend, fileUrl } from '../../lib/api'
import { useDraft } from '../../lib/draft'
import { uuid } from '../../lib/uuid'
import { getUser } from '../../lib/auth'
import { Field } from '../../components/Field'
import OptionButtons from '../../components/OptionButtons'
import ReferenceSearch from '../../components/ReferenceSearch'
import ComboBox from '../../components/ComboBox'
import OPSearch, { type OP } from '../../components/OPSearch'
import { matchKeywords } from '../../lib/fuzzy'
import type {
  Referencia, F158Config, F158Proceso, F158Campo, F158Item, F158Recorrido, F158Adjunto,
} from '../../lib/types'

type PendFile = { nombre: string; tipo: 'image' | 'video'; dataUrl: string }
type Entrada = {
  localId: string
  editId?: string
  fecha?: string          // solo admin puede editarla
  proceso?: string
  maquina?: string
  vals: Record<string, string>     // texto / cncna / opción elegida
  otros: Record<string, string>    // texto cuando la opción es "otro"
  refIds: Record<string, number>   // referencia_id (campos tipo referencia, legacy)
  prodTextos: Record<string, string> // producto traído de la OP (campos tipo referencia)
  marcas: Record<string, string>   // marca (campos tipo referencia)
  observaciones?: string
  subidos: F158Adjunto[]           // adjuntos ya en el servidor (al editar)
  createdAt: number
}
type State = { entradas: Entrada[]; seleccionadoId?: string }

const hoy = () => new Date().toISOString().slice(0, 10)
const refLabelPlain = (r?: Referencia) =>
  r ? (r.descripcion ? `${r.codigo} ${r.descripcion}` : r.codigo) : ''

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result))
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

// Decodifica la imagen (JPEG/PNG/etc.), la reduce a máx. 1600px y la vuelve a
// codificar como JPEG limpio y liviano. Normaliza formatos raros (p. ej. JPEG
// CMYK que algunos navegadores no muestran) y evita archivos enormes de cámara.
async function procesarImagen(file: File): Promise<PendFile> {
  const dataUrl = await readFile(file)
  const img = await loadImage(dataUrl)
  const maxDim = 1600
  let { width, height } = img
  if (Math.max(width, height) > maxDim) {
    const escala = maxDim / Math.max(width, height)
    width = Math.round(width * escala)
    height = Math.round(height * escala)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width || 1
  canvas.height = height || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('sin canvas')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = canvas.toDataURL('image/jpeg', 0.85)
  const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return { nombre, tipo: 'image', dataUrl: out }
}

function campoCompleto(c: F158Campo, e: Entrada): boolean {
  if (c.tipo === 'referencia') return (!!e.refIds[c.key] || !!(e.prodTextos[c.key] || '').trim()) && !!(e.marcas[c.key] || '').trim()
  if (c.tipo === 'opciones') {
    const v = e.vals[c.key]
    if (!v) return false
    if (v === 'otro') return !!(e.otros[c.key] || '').trim()
    return true
  }
  return !!(e.vals[c.key] || '').trim()  // texto / cncna
}

// Pregunta filtro del proceso (p. ej. "¿Están trabajando?" en KosExpress). La
// primera opción ("Sí") continúa el formato; con cualquier otra ("No") el resto
// del checklist no aplica y solo quedan las observaciones.
const gateDe = (proceso: F158Proceso) => proceso.campos.find((c) => c.gate)

function gateCerrado(proceso: F158Proceso, e: Entrada): boolean {
  const g = gateDe(proceso)
  if (!g) return false
  const v = e.vals[g.key]
  return !!v && v !== (g.opciones?.[0] ?? 'Sí')
}

// Campos que se muestran y se guardan: todos, o solo la pregunta filtro si se
// respondió que no están trabajando.
function camposVisibles(proceso: F158Proceso, e: Entrada): F158Campo[] {
  const g = gateDe(proceso)
  return g && gateCerrado(proceso, e) ? [g] : proceso.campos
}

function faltantesDe(proceso: F158Proceso, e: Entrada): string[] {
  const f: string[] = []
  const cerrado = gateCerrado(proceso, e)
  if (!cerrado && proceso.maquinas.length > 0 && !e.maquina) f.push('Máquina')
  for (const c of camposVisibles(proceso, e)) if (!campoCompleto(c, e)) f.push(c.label)
  return f
}

function buildItem(c: F158Campo, e: Entrada, refs: Referencia[]): F158Item {
  const base = { campo_key: c.key, campo_label: c.label, tipo: c.tipo }
  if (c.tipo === 'referencia') {
    const r = refs.find((x) => x.id === e.refIds[c.key])
    const producto = (e.prodTextos[c.key] || (r ? refLabelPlain(r) : '')).trim()
    const marca = e.marcas[c.key] ?? ''
    const valor = (producto + (marca ? ` ${marca}` : '')).trim()
    return { ...base, valor: valor || null, ref_id: e.refIds[c.key] ?? null, marca: marca || null }
  }
  if (c.tipo === 'opciones') {
    const v = e.vals[c.key]
    const valor = v === 'otro' ? (e.otros[c.key] ?? '') : (v ?? '')
    return { ...base, valor: valor || null }
  }
  return { ...base, valor: e.vals[c.key] ?? null }
}

export default function F158Form({
  onExit, editarId, onEditarConsumido,
}: {
  onExit: () => void
  editarId?: string | null
  onEditarConsumido?: () => void
}) {
  const [config, setConfig] = useState<F158Config | null>(null)
  const [refs, setRefs] = useState<Referencia[]>([])
  const [guardados, setGuardados] = useState<F158Recorrido[]>([])
  const [pend, setPend] = useState<Record<string, PendFile[]>>({})
  const [verGuardados, setVerGuardados] = useState(false)
  const [busqGuardados, setBusqGuardados] = useState('')
  const [msg, setMsg] = useState('')
  const user = getUser()
  const admin = user?.rol === 'admin'

  const [st, setSt] = useDraft<State>('draft_f158_v1', { entradas: [] })

  const cargarGuardados = () =>
    apiGet<F158Recorrido[]>(`/f158/recorridos?mios=true&fecha=${hoy()}`).then(setGuardados).catch(() => {})

  useEffect(() => {
    apiGet<F158Config>('/f158/config').then(setConfig).catch(() => {})
    apiGet<Referencia[]>('/catalogos/referencias').then(setRefs).catch(() => {})
    cargarGuardados()
  }, [])

  // Edición pedida desde "Ver registros F-158": carga ese recorrido en el taller.
  useEffect(() => {
    if (!editarId || !config) return
    apiGet<F158Recorrido>(`/f158/recorridos/${editarId}`)
      .then((r) => editarGuardado(r))
      .catch(() => {})
      .finally(() => onEditarConsumido?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId, config])

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2800) }
  const procesoDe = (key?: string) => config?.procesos.find((p) => p.key === key)
  const procLabel = (key: string) => config?.procesos.find((p) => p.key === key)?.label ?? key

  const selected = st.entradas.find((e) => e.localId === st.seleccionadoId)

  const setEntrada = (id: string, fn: (e: Entrada) => Entrada) =>
    setSt((s) => ({ ...s, entradas: s.entradas.map((e) => (e.localId === id ? fn(e) : e)) }))
  const patch = (id: string, p: Partial<Entrada>) => setEntrada(id, (e) => ({ ...e, ...p }))
  const upd = (p: Partial<Entrada>) => selected && patch(selected.localId, p)

  function agregar() {
    const nueva: Entrada = {
      localId: uuid(), fecha: hoy(), vals: {}, otros: {}, refIds: {}, prodTextos: {}, marcas: {}, subidos: [], createdAt: Date.now(),
    }
    setSt((s) => ({ ...s, entradas: [...s.entradas, nueva], seleccionadoId: nueva.localId }))
  }

  function quitar(id: string) {
    if (!window.confirm('¿Quitar esta entrada? (si no la has guardado, se pierde lo capturado)')) return
    setSt((s) => {
      const entradas = s.entradas.filter((e) => e.localId !== id)
      const seleccionadoId = s.seleccionadoId === id ? entradas[0]?.localId : s.seleccionadoId
      return { ...s, entradas, seleccionadoId }
    })
    setPend((p) => { const n = { ...p }; delete n[id]; return n })
  }

  function editarGuardado(r: F158Recorrido) {
    const existente = st.entradas.find((e) => e.editId === r.id)
    if (existente) { setSt((s) => ({ ...s, seleccionadoId: existente.localId })); return }
    const proc = procesoDe(r.proceso)
    const vals: Record<string, string> = {}, otros: Record<string, string> = {}
    const refIds: Record<string, number> = {}, marcas: Record<string, string> = {}
    const prodTextos: Record<string, string> = {}
    for (const it of r.items) {
      const campo = proc?.campos.find((c) => c.key === it.campo_key)
      if (it.tipo === 'referencia') {
        if (it.ref_id) refIds[it.campo_key] = it.ref_id
        if (it.marca) marcas[it.campo_key] = it.marca
        // Referencia guardada como texto (traída de la OP, sin FK): se recupera el producto.
        if (!it.ref_id && it.valor) {
          const m = it.marca ?? ''
          prodTextos[it.campo_key] = m && it.valor.endsWith(` ${m}`) ? it.valor.slice(0, it.valor.length - m.length - 1) : it.valor
        }
      } else if (it.tipo === 'opciones') {
        const v = it.valor ?? ''
        if (campo?.opciones?.includes(v)) vals[it.campo_key] = v
        else if (v) { vals[it.campo_key] = 'otro'; otros[it.campo_key] = v }
      } else if (it.valor != null) {
        vals[it.campo_key] = it.valor
      }
    }
    const nueva: Entrada = {
      localId: uuid(), editId: r.id, fecha: r.fecha, proceso: r.proceso, maquina: r.maquina ?? undefined,
      vals, otros, refIds, prodTextos, marcas, observaciones: r.observaciones ?? undefined,
      subidos: r.adjuntos, createdAt: Date.now(),
    }
    setSt((s) => ({ ...s, entradas: [...s.entradas, nueva], seleccionadoId: nueva.localId }))
  }

  async function addFiles(id: string, files: FileList | null) {
    if (!files) return
    const nuevos: PendFile[] = []
    for (const f of Array.from(files)) {
      if (f.type.startsWith('video') || (!f.type.startsWith('image') && !/\.(png|jpe?g|webp|gif|bmp|jfif|heic)$/i.test(f.name))) {
        const dataUrl = await readFile(f)  // video u otro archivo: se sube tal cual
        nuevos.push({ nombre: f.name, tipo: f.type.startsWith('video') ? 'video' : 'image', dataUrl })
      } else {
        try {
          nuevos.push(await procesarImagen(f))  // imagen: normaliza a JPEG liviano
        } catch {
          const dataUrl = await readFile(f)  // si el navegador no puede decodificarla, se sube original
          nuevos.push({ nombre: f.name, tipo: 'image', dataUrl })
        }
      }
    }
    setPend((p) => ({ ...p, [id]: [...(p[id] || []), ...nuevos] }))
  }
  const quitarPend = (id: string, idx: number) =>
    setPend((p) => ({ ...p, [id]: (p[id] || []).filter((_, i) => i !== idx) }))

  async function guardar(e: Entrada) {
    const proc = procesoDe(e.proceso)
    if (!proc) { flash('Selecciona primero el proceso'); return }
    const faltan = faltantesDe(proc, e)
    if (faltan.length) { flash(`Faltan ${faltan.length} campo(s) obligatorio(s)`); return }

    const items = camposVisibles(proc, e).map((c) => buildItem(c, e, refs))
    const body = { proceso: e.proceso, maquina: e.maquina ?? null, observaciones: e.observaciones ?? null, items, ...(admin ? { fecha: e.fecha || hoy() } : {}) }

    let ok = false
    let recorridoId = e.localId
    if (e.editId) {
      const r = await apiMutate('PUT', `/f158/recorridos/${e.editId}`, body)
      ok = r.ok; recorridoId = e.editId
    } else {
      const r = await apiMutate('POST', '/f158/recorridos', { id: e.localId, ...body })
      ok = r.ok
    }

    const pendientes = pend[e.localId] || []

    // Encolado (sin conexión) y con fotos: no cerrar la entrada para no perder los
    // archivos; se subirán al presionar Guardar de nuevo con conexión.
    if (!ok && pendientes.length) {
      cargarGuardados()
      flash('Sin conexión: el recorrido quedó pendiente. Cuando vuelva el internet presiona Guardar de nuevo para adjuntar las fotos.')
      return
    }

    if (ok && pendientes.length) {
      try {
        for (const f of pendientes) {
          await apiSend('POST', `/f158/recorridos/${recorridoId}/adjuntos`, { nombre: f.nombre, tipo: f.tipo, data: f.dataUrl })
        }
      } catch {
        cargarGuardados()
        flash('Recorrido guardado, pero falló la subida de alguna foto/video. Presiona Guardar de nuevo para reintentar.')
        return  // conserva la entrada y los archivos para reintentar
      }
    }

    setSt((s) => {
      const entradas = s.entradas.filter((x) => x.localId !== e.localId)
      const seleccionadoId = s.seleccionadoId === e.localId ? entradas[0]?.localId : s.seleccionadoId
      return { ...s, entradas, seleccionadoId }
    })
    setPend((p) => { const n = { ...p }; delete n[e.localId]; return n })
    cargarGuardados()
    flash(!ok ? 'Guardado (pendiente de sincronizar)' : e.editId ? 'Recorrido actualizado ✔' : 'Recorrido guardado ✔')
  }

  const resumen = (e: Entrada) => {
    if (!e.proceso) return 'Sin proceso'
    return procLabel(e.proceso) + (e.maquina ? ` · ${e.maquina}` : '')
  }

  // Nombre personalizado de un recorrido guardado, p. ej. "Flexo 1 - VASO 7 OZ tatiana".
  // Solo se añade el producto cuando el proceso maneja referencia (Slitter no la
  // tiene: allí queda solo la máquina).
  const nombreRecorrido = (r: F158Recorrido) => {
    const base = r.maquina || procLabel(r.proceso)
    const ref = r.items.find((i) => i.tipo === 'referencia' && i.valor)?.valor
    return base + (ref ? ` - ${ref}` : '')
  }

  const guardadosFiltrados = guardados.filter((r) =>
    matchKeywords(busqGuardados, `${nombreRecorrido(r)} ${procLabel(r.proceso)}`))

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <button className="btn btn-ghost" onClick={onExit}>← Ir al inicio</button>
      </div>
      <div className="section-title">
        <span className="code">F-158</span>
        <h2>Rutas Calidad</h2>
        {user && <span className="muted" style={{ marginLeft: 'auto' }}>Responsable: <strong>{user.nombre}</strong> · {new Date().toLocaleDateString('es-CO')}</span>}
      </div>

      <div className="f006-layout">
        <aside className="side">
          <button className="add" onClick={agregar}>AGREGAR +</button>
          <h4>Entradas abiertas ({st.entradas.length})</h4>
          <div className="prod-list">
            {st.entradas.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Presiona AGREGAR + para iniciar un recorrido.</p>}
            {st.entradas.map((e) => (
              <button
                key={e.localId}
                className={'prod-item' + (e.localId === st.seleccionadoId ? ' sel' : '')}
                onClick={() => setSt((s) => ({ ...s, seleccionadoId: e.localId }))}
              >
                <span className="pt">{resumen(e)}</span>
                <span className="pm">
                  {(pend[e.localId]?.length || 0) > 0 ? `${pend[e.localId].length} archivo(s) · ` : ''}
                  {e.editId ? 'editando' : 'sin guardar'}
                </span>
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
              <input
                className="filt-search" style={{ marginBottom: 6 }}
                placeholder="Buscar por palabras clave…"
                value={busqGuardados}
                onChange={(e) => setBusqGuardados(e.target.value)}
              />
              {guardados.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Aún no has guardado recorridos hoy.</p>}
              {guardados.length > 0 && guardadosFiltrados.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Sin coincidencias.</p>}
              {guardadosFiltrados.map((r) => (
                <div key={r.id} className="saved-item">
                  <div>
                    <strong>{nombreRecorrido(r)}</strong>
                    <div className="muted">
                      {new Date(r.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
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
              <p>Selecciona una entrada o presiona <strong>AGREGAR +</strong> para iniciar un recorrido.</p>
              <button className="btn btn-primary" onClick={agregar}>AGREGAR +</button>
            </div>
          ) : !config ? (
            <div className="panel"><p className="muted">Cargando formato…</p></div>
          ) : !selected.proceso ? (
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>¿Qué proceso vas a revisar?</h3>
              <div className="proc-grid">
                {config.procesos.map((p) => (
                  <button key={p.key} className="proc-btn" onClick={() => upd({ proceso: p.key, maquina: undefined })}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EntradaDetalle
              key={selected.localId}
              entrada={selected}
              admin={admin}
              proceso={procesoDe(selected.proceso)!}
              config={config}
              refs={refs}
              pend={pend[selected.localId] || []}
              upd={upd}
              onAddFiles={(files) => addFiles(selected.localId, files)}
              onQuitarPend={(idx) => quitarPend(selected.localId, idx)}
              onGuardar={() => guardar(selected)}
              onCambiarProceso={() => upd({ proceso: undefined, maquina: undefined })}
            />
          )}
        </section>
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}

function EntradaDetalle({
  entrada, admin, proceso, config, refs, pend, upd, onAddFiles, onQuitarPend, onGuardar, onCambiarProceso,
}: {
  entrada: Entrada
  admin: boolean
  proceso: F158Proceso
  config: F158Config
  refs: Referencia[]
  pend: PendFile[]
  upd: (p: Partial<Entrada>) => void
  onAddFiles: (files: FileList | null) => void
  onQuitarPend: (idx: number) => void
  onGuardar: () => void
  onCambiarProceso: () => void
}) {
  const setVal = (key: string, v: string) => upd({ vals: { ...entrada.vals, [key]: v } })
  const setOtro = (key: string, v: string) => upd({ otros: { ...entrada.otros, [key]: v } })
  const setRefId = (key: string, id: number) => upd({ refIds: { ...entrada.refIds, [key]: id } })
  const setProdText = (key: string, v: string) => upd({ prodTextos: { ...entrada.prodTextos, [key]: v } })
  const setMarca = (key: string, v: string) => upd({ marcas: { ...entrada.marcas, [key]: v } })

  // La OP (campo "op") autollena la Referencia y la Marca del recorrido.
  const refKey = proceso.campos.find((c) => c.tipo === 'referencia')?.key
  const onOpResolve = (o: OP) => {
    const p: Partial<Entrada> = { vals: { ...entrada.vals, op: o.op } }
    if (refKey) {
      p.prodTextos = { ...entrada.prodTextos, [refKey]: o.referencia }
      p.marcas = { ...entrada.marcas, [refKey]: o.marca }
    }
    upd(p)
  }

  const faltan = faltantesDe(proceso, entrada)
  const cerrado = gateCerrado(proceso, entrada)
  const campos = camposVisibles(proceso, entrada)

  return (
    <div>
      <div className="prod-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>{proceso.label}</span>
        <button className="btn btn-ghost pill-btn" onClick={onCambiarProceso}>Cambiar proceso</button>
      </div>
      {proceso.nota && <p className="tag-warn" style={{ marginTop: 0 }}>⚠ {proceso.nota}</p>}

      <div className="panel">
        {admin && (
          <Field label="Fecha" hint="editable (solo admin)">
            <input type="date" value={entrada.fecha ?? ''} onChange={(e) => upd({ fecha: e.target.value })} />
          </Field>
        )}
        {!cerrado && proceso.maquinas.length > 0 && (
          <div className="maq-box">
            <div className="maq-title">MÁQUINAS</div>
            {proceso.maquinas.length > 8 ? (
              <ComboBox
                value={entrada.maquina ?? ''}
                onChange={(m) => upd({ maquina: m })}
                options={proceso.maquinas}
                placeholder="Buscar o escribir máquina…"
              />
            ) : (
              <OptionButtons
                options={proceso.maquinas.map((m) => ({ value: m, label: m }))}
                value={entrada.maquina}
                onChange={(m) => upd({ maquina: m })}
              />
            )}
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>Checklist <span className="hint">(todos los campos son obligatorios)</span></h3>

        {campos.map((c) => (
          <CampoField
            key={c.key}
            campo={c}
            config={config}
            refs={refs}
            vals={entrada.vals}
            otros={entrada.otros}
            refId={entrada.refIds[c.key]}
            prodTexto={entrada.prodTextos[c.key] ?? ''}
            marca={entrada.marcas[c.key] ?? ''}
            onVal={(v) => setVal(c.key, v)}
            onOtro={(v) => setOtro(c.key, v)}
            onRefId={(id) => setRefId(c.key, id)}
            onProdText={(v) => setProdText(c.key, v)}
            onMarca={(v) => setMarca(c.key, v)}
            onOpResolve={onOpResolve}
          />
        ))}

        {cerrado && (
          <p className="tag-warn">
            ⚠ El proceso no está trabajando: el resto del checklist no aplica. Escribe las observaciones y guarda el recorrido.
          </p>
        )}

        <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
        <Field label="Observaciones / comentarios" hint={cerrado ? 'indica por qué el proceso no está trabajando' : undefined}>
          <textarea value={entrada.observaciones ?? ''} onChange={(ev) => upd({ observaciones: ev.target.value })} />
        </Field>

        <Field label="Registro fotográfico o video" hint="opcional">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              📷 Tomar foto
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={(ev) => { onAddFiles(ev.target.files); ev.target.value = '' }} />
            </label>
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              📁 Subir archivo
              <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }}
                onChange={(ev) => { onAddFiles(ev.target.files); ev.target.value = '' }} />
            </label>
          </div>
        </Field>
        {(pend.length > 0 || entrada.subidos.length > 0) && (
          <div className="adj-grid">
            {entrada.subidos.map((a) => (
              <a key={a.id} className="adj-chip" href={fileUrl(a.url)} target="_blank" rel="noreferrer">
                {a.tipo === 'video' ? '🎬' : '🖼'} {a.nombre}
              </a>
            ))}
            {pend.map((f, i) => (
              <span key={i} className="adj-chip nuevo">
                {f.tipo === 'video'
                  ? <>🎬 {f.nombre}</>
                  : <img className="adj-thumb" src={f.dataUrl} alt={f.nombre} />}
                <span className="quitar-x" title="Quitar" onClick={() => onQuitarPend(i)}>×</span>
              </span>
            ))}
          </div>
        )}

        {faltan.length > 0 && (
          <p className="tag-bad">
            ⚠ Faltan {faltan.length} campo(s) obligatorio(s): {faltan.slice(0, 6).join(', ')}{faltan.length > 6 ? '…' : ''}.
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={faltan.length > 0} onClick={onGuardar}>
            {entrada.editId ? 'Actualizar recorrido' : 'Guardar recorrido'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CampoField({
  campo, config, refs, vals, otros, refId, prodTexto, marca, onVal, onOtro, onRefId, onProdText, onMarca, onOpResolve,
}: {
  campo: F158Campo
  config: F158Config
  refs: Referencia[]
  vals: Record<string, string>
  otros: Record<string, string>
  refId?: number
  prodTexto: string
  marca: string
  onVal: (v: string) => void
  onOtro: (v: string) => void
  onRefId: (id: number) => void
  onProdText: (v: string) => void
  onMarca: (v: string) => void
  onOpResolve: (o: OP) => void
}) {
  if (campo.tipo === 'referencia') {
    // Si la OP ya trajo el producto, se muestra como texto (no hay que buscar).
    const auto = !!prodTexto.trim()
    return (
      <div className="row" style={{ marginBottom: 8 }}>
        <Field label={campo.label}>
          {auto
            ? <input value={prodTexto} onChange={(e) => onProdText(e.target.value)} placeholder="Se autollena al elegir la OP" />
            : <ReferenceSearch referencias={refs} value={refId} onChange={onRefId} />}
        </Field>
        <Field label="Marca">
          <input value={marca} onChange={(e) => onMarca(e.target.value)} />
        </Field>
      </div>
    )
  }
  if (campo.tipo === 'texto') {
    if (campo.key === 'op') {
      return (
        <Field label={campo.label}>
          <OPSearch value={vals[campo.key] ?? ''} onChange={onVal} onResolve={onOpResolve} />
        </Field>
      )
    }
    return (
      <Field label={campo.label}>
        <input value={vals[campo.key] ?? ''} onChange={(e) => onVal(e.target.value)} />
      </Field>
    )
  }
  if (campo.tipo === 'cncna') {
    return (
      <div className="check-row">
        <span className="label">{campo.label}</span>
        <OptionButtons
          options={config.resultados.map((r) => ({ value: r, label: r }))}
          value={vals[campo.key]}
          onChange={onVal}
        />
      </div>
    )
  }
  // opciones
  const opts = (campo.opciones ?? []).map((o) => ({ value: o, label: o }))
  if (campo.otro) opts.push({ value: 'otro', label: 'Otro ¿cuál?' })
  return (
    <Field label={campo.label}>
      <OptionButtons options={opts} value={vals[campo.key]} onChange={onVal} />
      {vals[campo.key] === 'otro' && (
        <input style={{ marginTop: 6 }} placeholder="¿Cuál?" value={otros[campo.key] ?? ''} onChange={(e) => onOtro(e.target.value)} />
      )}
    </Field>
  )
}
