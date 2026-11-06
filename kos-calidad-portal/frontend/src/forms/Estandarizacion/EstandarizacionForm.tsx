import { useEffect, useState } from 'react'
import { apiGet, apiMutate, apiSend } from '../../lib/api'
import { useDraft } from '../../lib/draft'
import { uuid } from '../../lib/uuid'
import { getUser } from '../../lib/auth'
import { Field } from '../../components/Field'
import OptionButtons from '../../components/OptionButtons'
import ComboBox from '../../components/ComboBox'
import OPSearch, { type OP } from '../../components/OPSearch'
import type { EstConfig } from '../../lib/types'

type Categoria = 'tablero' | 'vaso'
type PendFile = { nombre: string; tipo: 'image' | 'video'; dataUrl: string; categoria: Categoria }

type Draft = {
  fecha?: string          // solo admin
  maquina?: string
  op?: string
  referencia_texto?: string
  marca?: string
  calibre?: string
  calibreOtro?: string
  proveedor_papel?: string
  tipo_papel?: string
  tipo_humectacion?: string
  calidad_vaso?: string
  h1?: string; h2?: string; h3?: string; h4?: string; h5?: string; h6?: string
  observaciones?: string
}

const HS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
const hoy = () => new Date().toISOString().slice(0, 10)
const vacia = (): Draft => ({ fecha: hoy() })

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
// Reduce la imagen a máx. 1600px y la recodifica como JPEG liviano (igual que F-158).
async function procesarImagen(file: File, categoria: Categoria): Promise<PendFile> {
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
  return { nombre, tipo: 'image', dataUrl: out, categoria }
}

export default function EstandarizacionForm({
  onExit, onVerRegistros,
}: {
  onExit: () => void
  onVerRegistros?: () => void
}) {
  const [config, setConfig] = useState<EstConfig | null>(null)
  const [st, setSt, limpiarDraft] = useDraft<Draft>('draft_estand_v1', vacia())
  const [pend, setPend] = useState<PendFile[]>([])   // fotos nuevas (sin subir)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const user = getUser()
  const admin = user?.rol === 'admin'

  const set = (p: Partial<Draft>) => setSt((s) => ({ ...s, ...p }))
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3000) }

  useEffect(() => {
    apiGet<EstConfig>('/estandarizacion/config').then(setConfig).catch(() => {})
  }, [])

  const onOp = (o: OP) => set({ op: o.op, referencia_texto: o.referencia, marca: o.marca })

  async function addFiles(files: FileList | null, categoria: Categoria) {
    if (!files) return
    const nuevos: PendFile[] = []
    for (const f of Array.from(files)) {
      if (f.type.startsWith('video') || (!f.type.startsWith('image') && !/\.(png|jpe?g|webp|gif|bmp|jfif|heic)$/i.test(f.name))) {
        const dataUrl = await readFile(f)
        nuevos.push({ nombre: f.name, tipo: f.type.startsWith('video') ? 'video' : 'image', dataUrl, categoria })
      } else {
        try { nuevos.push(await procesarImagen(f, categoria)) }
        catch { const dataUrl = await readFile(f); nuevos.push({ nombre: f.name, tipo: 'image', dataUrl, categoria }) }
      }
    }
    setPend((p) => [...p, ...nuevos])
  }
  const quitarPend = (idx: number) => setPend((p) => p.filter((_, i) => i !== idx))

  function limpiar() {
    setSt(vacia()); limpiarDraft(); setPend([])
  }

  async function guardar() {
    if (!(st.maquina || '').trim()) { flash('Selecciona la máquina'); return }
    setGuardando(true)
    const calibre = st.calibre === 'otro' ? (st.calibreOtro || '').trim() : (st.calibre || '')
    const campos = {
      maquina: st.maquina ?? null,
      orden_produccion: (st.op || '').trim() || null,
      referencia_texto: (st.referencia_texto || '').trim() || null,
      marca: (st.marca || '').trim() || null,
      calibre: calibre || null,
      proveedor_papel: (st.proveedor_papel || '').trim() || null,
      tipo_papel: st.tipo_papel ?? null,
      tipo_humectacion: (st.tipo_humectacion || '').trim() || null,
      calidad_vaso: (st.calidad_vaso || '').trim() || null,
      h1: (st.h1 || '').trim() || null, h2: (st.h2 || '').trim() || null, h3: (st.h3 || '').trim() || null,
      h4: (st.h4 || '').trim() || null, h5: (st.h5 || '').trim() || null, h6: (st.h6 || '').trim() || null,
      observaciones: (st.observaciones || '').trim() || null,
    }

    try {
      const id = uuid()
      const r = await apiMutate('POST', '/estandarizacion/registros', { id, ...(admin ? { fecha: st.fecha || hoy() } : {}), ...campos })
      const ok = r.ok

      // Encolado sin conexión y con fotos: no limpiar para no perderlas.
      if (!ok && pend.length) {
        flash('Sin conexión: el registro quedó pendiente. Cuando vuelva el internet presiona Guardar de nuevo para adjuntar las fotos.')
        setGuardando(false)
        return
      }
      if (ok && pend.length) {
        for (const f of pend) {
          await apiSend('POST', `/estandarizacion/registros/${id}/adjuntos`, {
            nombre: f.nombre, tipo: f.tipo, data: f.dataUrl, categoria: f.categoria,
          })
        }
      }
      limpiar()
      flash(!ok ? 'Guardado (pendiente de sincronizar)' : 'Registro guardado ✔')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const pendTablero = pend.map((f, i) => ({ f, i })).filter((x) => x.f.categoria === 'tablero')
  const pendVaso = pend.map((f, i) => ({ f, i })).filter((x) => x.f.categoria === 'vaso')

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 6, gap: 8 }}>
        <button className="btn btn-ghost" onClick={onExit}>← Ir al inicio</button>
        {onVerRegistros && <button className="btn btn-ghost" onClick={onVerRegistros}>📄 Ver registros</button>}
      </div>
      <div className="section-title">
        <span className="code">🔬</span>
        <h2>Estandarización</h2>
        {user && <span className="muted" style={{ marginLeft: 'auto' }}>Responsable: <strong>{user.nombre}</strong> · {new Date().toLocaleDateString('es-CO')}</span>}
      </div>

      {!config ? (
        <div className="panel"><p className="muted">Cargando…</p></div>
      ) : (
        <div className="panel">
          {admin && (
            <Field label="Fecha" hint="editable (solo admin)">
              <input type="date" value={st.fecha ?? ''} onChange={(e) => set({ fecha: e.target.value })} />
            </Field>
          )}

          <div className="maq-box">
            <div className="maq-title">MÁQUINA</div>
            <ComboBox
              value={st.maquina ?? ''}
              onChange={(m) => set({ maquina: m })}
              options={config.maquinas}
              placeholder="Buscar o escribir máquina…"
            />
          </div>

          <Field label="Orden de producción (OP)" hint="al elegir la OP se autollenan la referencia y la marca">
            <OPSearch value={st.op ?? ''} onChange={(v) => set({ op: v })} onResolve={onOp} />
          </Field>
          <div className="row">
            <Field label="Referencia">
              <input value={st.referencia_texto ?? ''} onChange={(e) => set({ referencia_texto: e.target.value })} placeholder="Se autollena al elegir la OP" />
            </Field>
            <Field label="Marca">
              <input value={st.marca ?? ''} onChange={(e) => set({ marca: e.target.value })} />
            </Field>
          </div>

          <Field label="Calibre">
            <OptionButtons
              options={[...config.calibres.map((c) => ({ value: c, label: c })), { value: 'otro', label: 'Otro ¿cuál?' }]}
              value={st.calibre}
              onChange={(v) => set({ calibre: v })}
            />
            {st.calibre === 'otro' && (
              <input style={{ marginTop: 6 }} placeholder="¿Cuál?" value={st.calibreOtro ?? ''} onChange={(e) => set({ calibreOtro: e.target.value })} />
            )}
          </Field>

          <Field label="Proveedor papel">
            <input value={st.proveedor_papel ?? ''} onChange={(e) => set({ proveedor_papel: e.target.value })} />
          </Field>

          <Field label="Tipo de papel">
            <OptionButtons
              options={config.tipos_papel.map((t) => ({ value: t, label: t }))}
              value={st.tipo_papel}
              onChange={(v) => set({ tipo_papel: v })}
            />
          </Field>

          <Field label="Tipo de humectación">
            <input value={st.tipo_humectacion ?? ''} onChange={(e) => set({ tipo_humectacion: e.target.value })} />
          </Field>

          <Field label="Calidad vaso">
            <textarea value={st.calidad_vaso ?? ''} onChange={(e) => set({ calidad_vaso: e.target.value })} />
          </Field>

          {/* Resistencias del tablero */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
          <h3 style={{ margin: '0 0 4px' }}>Resistencias (tablero)</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
            Toma la foto del tablero eléctrico y escribe los valores de H1 a H6.
            (La transcripción automática desde la foto se activará pronto.)
          </p>
          <div className="est-hgrid">
            {HS.map((h, i) => (
              <label key={h} className="est-hcell">
                <span>H{i + 1}</span>
                <input type="text" inputMode="decimal" value={st[h] ?? ''} onChange={(e) => set({ [h]: e.target.value } as Partial<Draft>)} />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              📷 Foto del tablero
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={(ev) => { addFiles(ev.target.files, 'tablero'); ev.target.value = '' }} />
            </label>
          </div>
          {pendTablero.length > 0 && (
            <div className="adj-grid" style={{ marginTop: 8 }}>
              {pendTablero.map(({ f, i }) => (
                <span key={i} className="adj-chip nuevo">
                  <img className="adj-thumb" src={f.dataUrl} alt={f.nombre} />
                  <span className="quitar-x" title="Quitar" onClick={() => quitarPend(i)}>×</span>
                </span>
              ))}
            </div>
          )}

          {/* Observaciones */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
          <Field label="Observaciones / comentarios" hint="opcional">
            <textarea value={st.observaciones ?? ''} onChange={(e) => set({ observaciones: e.target.value })} />
          </Field>

          {/* Registro fotográfico del vaso */}
          <Field label="Registro fotográfico (calidad del vaso)" hint="opcional">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                📷 Tomar foto
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={(ev) => { addFiles(ev.target.files, 'vaso'); ev.target.value = '' }} />
              </label>
              <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                📁 Subir archivo
                <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }}
                  onChange={(ev) => { addFiles(ev.target.files, 'vaso'); ev.target.value = '' }} />
              </label>
            </div>
          </Field>
          {pendVaso.length > 0 && (
            <div className="adj-grid">
              {pendVaso.map(({ f, i }) => (
                <span key={i} className="adj-chip nuevo">
                  {f.tipo === 'video' ? <>🎬 {f.nombre}</> : <img className="adj-thumb" src={f.dataUrl} alt={f.nombre} />}
                  <span className="quitar-x" title="Quitar" onClick={() => quitarPend(i)}>×</span>
                </span>
              ))}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={limpiar} disabled={guardando}>Limpiar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar registro'}
            </button>
          </div>
        </div>
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
