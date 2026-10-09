import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { apiBaseUrl, apiGet, apiSend } from '../../lib/api'
import { getToken } from '../../lib/auth'
import { matchKeywords } from '../../lib/fuzzy'
import type { Referencia } from '../../lib/types'
import { Field } from '../../components/Field'
import ReferenceSearch from '../../components/ReferenceSearch'
import AlertaImagen, { fechaLarga, numeroTxt, type AlertaDatos, type Defecto } from './AlertaImagen'

type Alerta = Omit<AlertaDatos, 'codigo' | 'area' | 'impacto' | 'cliente' | 'op_lote'> & {
  id: number
  codigo: string | null; area: string | null; impacto: string | null
  cliente: string | null; op_lote: string | null
  tiene_foto: boolean; creado_por: string | null
}

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DEF_VACIO: Defecto = { titulo: '', detalle: '', estado: 'nuevo' }
const vacia = (numero: number): AlertaDatos => ({
  numero, fecha: hoy(), producto: '', codigo: '', titulo: '', etiqueta: 'NUEVO', reporte: '',
  area: '', impacto: '', defectos: [{ ...DEF_VACIO }, { ...DEF_VACIO }], acciones: ['', '', ''], cliente: '', op_lote: '',
})
const aDatos = (a: Alerta): AlertaDatos => ({
  numero: a.numero, fecha: a.fecha, producto: a.producto, codigo: a.codigo ?? '', titulo: a.titulo,
  etiqueta: a.etiqueta, reporte: a.reporte, area: a.area ?? '', impacto: a.impacto ?? '',
  defectos: [...a.defectos, { ...DEF_VACIO }, { ...DEF_VACIO }].slice(0, Math.max(2, a.defectos.length)),
  acciones: [...a.acciones, '', '', ''].slice(0, 3), cliente: a.cliente ?? '', op_lote: a.op_lote ?? '',
})

// Comparación tolerante (sin tildes, mayúsculas ni signos) para detectar reincidencias.
const norm = (s: string | null | undefined) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const parecido = (a: string, b: string) => {
  const x = norm(a), y = norm(b)
  if (!x || !y) return false
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))
}
const mismoProducto = (a: Alerta, d: AlertaDatos) =>
  (norm(a.codigo) && norm(d.codigo) ? norm(a.codigo) === norm(d.codigo) : false) || parecido(a.producto, d.producto)

// Reduce la foto a máx. 1600 px y la vuelve JPEG liviano (fotos de celular/WhatsApp).
async function procesarFoto(file: File): Promise<string> {
  const src = await new Promise<string>((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src
  })
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escala) || 1
  c.height = Math.round(img.height * escala) || 1
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('sin canvas')
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.88)
}

// La foto guardada se pide al portal (mismo origen) para poder pintarla en el PNG.
async function cargarFoto(id: number): Promise<string | null> {
  const res = await fetch(`${apiBaseUrl()}/alertas/${id}/foto`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) return null
  const blob = await res.blob()
  return new Promise((res2) => { const fr = new FileReader(); fr.onload = () => res2(String(fr.result)); fr.onerror = () => res2(null); fr.readAsDataURL(blob) })
}

export default function AlertasCalidad() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [editor, setEditor] = useState<{ id: number | null; datos: AlertaDatos; foto: string | null; fotoNueva: boolean } | null>(null)

  const recargar = () => apiGet<Alerta[]>('/alertas').then(setAlertas).catch(() => {}).finally(() => setCargando(false))
  useEffect(() => { recargar() }, [])

  async function nueva() {
    const { numero } = await apiGet<{ numero: number }>('/alertas/siguiente')
    setEditor({ id: null, datos: vacia(numero), foto: null, fotoNueva: false })
  }
  async function abrir(a: Alerta) {
    setEditor({ id: a.id, datos: aDatos(a), foto: null, fotoNueva: false })
    if (a.tiene_foto) {
      const foto = await cargarFoto(a.id)
      setEditor((e) => (e && e.id === a.id && !e.fotoNueva ? { ...e, foto } : e))
    }
  }
  async function duplicar(a: Alerta) {
    const { numero } = await apiGet<{ numero: number }>('/alertas/siguiente')
    const d = aDatos(a)
    // Mismo producto y mismos defectos: todo lo que ya se había reportado "sigue".
    setEditor({
      id: null, foto: null, fotoNueva: false,
      datos: { ...d, numero, fecha: hoy(), etiqueta: 'REINCIDENTE', defectos: d.defectos.map((x) => (x.titulo.trim() ? { ...x, estado: 'sigue' } : x)) },
    })
  }
  async function borrar(a: Alerta) {
    if (!window.confirm(`¿Borrar la alerta N° ${numeroTxt(a.numero)} (${a.titulo})? No se puede deshacer.`)) return
    try { await apiSend('DELETE', `/alertas/${a.id}`); recargar() } catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo borrar') }
  }

  const filtradas = useMemo(
    () => alertas.filter((a) => matchKeywords(q, `${numeroTxt(a.numero)} ${a.producto} ${a.codigo ?? ''} ${a.titulo} ${a.cliente ?? ''} ${a.defectos.map((d) => d.titulo).join(' ')}`)),
    [alertas, q],
  )

  if (editor) {
    return (
      <Editor
        key={editor.id ?? 'nueva-' + editor.datos.numero}
        inicial={editor}
        alertas={alertas}
        onSalir={() => { setEditor(null); recargar() }}
      />
    )
  }

  return (
    <div>
      <div className="section-title"><span className="code">⚠️</span><h2>Alertas de Calidad</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>Comunicados de reclamos de cliente. Llena los datos, revisa la vista previa y descarga la imagen para compartir.</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input className="filt-search" style={{ maxWidth: 460, flex: '1 1 240px', margin: 0 }} type="search"
          placeholder="🔎 Buscar (número, producto, defecto, cliente)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={nueva}>➕ Nueva alerta</button>
      </div>
      {cargando ? <p className="muted">Cargando…</p> : (
        <div className="table-wrap">
          <table className="ftable">
            <thead><tr><th>N°</th><th>Fecha</th><th>Producto</th><th>Defecto</th><th>Tipo</th><th></th></tr></thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={6} className="muted center" style={{ padding: 18 }}>
                  {alertas.length === 0 ? 'Aún no hay alertas. La primera será la N° 015.' : 'Sin resultados.'}
                </td></tr>
              )}
              {filtradas.map((a) => (
                <tr key={a.id}>
                  <td><b>{numeroTxt(a.numero)}</b></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fechaLarga(a.fecha)}</td>
                  <td>{a.producto}{a.codigo && <div className="muted" style={{ fontSize: '.74rem' }}>{a.codigo}</div>}</td>
                  <td>{a.titulo}{a.cliente && <div className="muted" style={{ fontSize: '.74rem' }}>Cliente: {a.cliente}</div>}</td>
                  <td><span style={{ fontWeight: 700, fontSize: '.78rem', color: a.etiqueta === 'REINCIDENTE' ? 'var(--bad)' : 'var(--brand)' }}>{a.etiqueta}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost pill-btn" title="Abrir / editar" onClick={() => abrir(a)}>✏️</button>
                    <button className="btn btn-ghost pill-btn" title="Duplicar como nueva alerta (reincidencia)" onClick={() => duplicar(a)}>📄</button>
                    <button className="btn btn-ghost pill-btn" title="Borrar" onClick={() => borrar(a)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: '.82rem' }}>{filtradas.length} de {alertas.length} alertas</p>
        </div>
      )}
    </div>
  )
}

function Editor({ inicial, alertas, onSalir }: {
  inicial: { id: number | null; datos: AlertaDatos; foto: string | null; fotoNueva: boolean }
  alertas: Alerta[]
  onSalir: () => void
}) {
  const [id, setId] = useState(inicial.id)
  const [d, setD] = useState<AlertaDatos>(inicial.datos)
  const [foto, setFoto] = useState<string | null>(inicial.foto)
  const [fotoNueva, setFotoNueva] = useState(false)
  const [etiquetaManual, setEtiquetaManual] = useState(inicial.id !== null || inicial.datos.etiqueta === 'REINCIDENTE')
  const [refs, setRefs] = useState<Referencia[]>([])
  const [guardando, setGuardando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [cambios, setCambios] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0.45)

  // La foto guardada llega después de abrir el editor (se descarga aparte).
  useEffect(() => { if (!fotoNueva && inicial.foto) setFoto(inicial.foto) }, [inicial.foto]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiGet<Referencia[]>('/catalogos/referencias').then(setRefs).catch(() => {}) }, [])
  useEffect(() => {
    const el = cajaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setEscala(el.clientWidth / 1080))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const set = <K extends keyof AlertaDatos>(k: K, v: AlertaDatos[K]) => { setD((x) => ({ ...x, [k]: v })); setCambios(true) }
  const setDef = (i: number, p: Partial<Defecto>) => set('defectos', d.defectos.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const setAcc = (i: number, v: string) => set('acciones', d.acciones.map((x, j) => (j === i ? v : x)))

  // Alertas anteriores del mismo producto donde ya apareció un defecto parecido.
  const previas = (defecto: string) =>
    alertas.filter((a) => a.id !== id && a.numero < d.numero && mismoProducto(a, d) &&
      (parecido(a.titulo, defecto) || a.defectos.some((x) => parecido(x.titulo, defecto))))
  const listaNums = (as: Alerta[]) => as.map((a) => 'N° ' + numeroTxt(a.numero)).join(', ')
  const previasTitulo = d.titulo.trim() ? previas(d.titulo) : []
  const etiquetaSugerida: AlertaDatos['etiqueta'] =
    previasTitulo.length > 0 || d.defectos.some((x) => x.titulo.trim() && x.estado === 'sigue') ? 'REINCIDENTE' : 'NUEVO'
  const etiqueta = etiquetaManual ? d.etiqueta : etiquetaSugerida
  const datosImg = { ...d, etiqueta }

  async function elegirFoto(file?: File) {
    if (!file) return
    try { setFoto(await procesarFoto(file)); setFotoNueva(true); setCambios(true) } catch { window.alert('No se pudo leer la imagen') }
  }

  async function guardar(): Promise<boolean> {
    if (!d.producto.trim() || !d.titulo.trim()) { window.alert('Faltan el producto y el defecto principal.'); return false }
    if (!d.numero || !d.fecha) { window.alert('Faltan el número o la fecha.'); return false }
    setGuardando(true)
    try {
      const body = { ...d, etiqueta }
      const r = id === null ? await apiSend<{ id: number }>('POST', '/alertas', body) : await apiSend<{ id: number }>('PUT', `/alertas/${id}`, body)
      if (fotoNueva && foto) {
        await apiSend('PUT', `/alertas/${r.id}/foto`, { nombre: 'foto.jpg', data: foto })
        setFotoNueva(false)
      }
      setId(r.id); setCambios(false)
      return true
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo guardar')
      return false
    } finally { setGuardando(false) }
  }

  async function generarPng(): Promise<string | null> {
    const el = imgRef.current
    if (!el) return null
    setExportando(true)
    try {
      await document.fonts.ready
      const opts = { pixelRatio: 2, width: 1080, height: 1080, cacheBust: true, style: { transform: 'none' } }
      await toPng(el, opts) // el primer render precarga fuentes e imágenes (Safari)
      return await toPng(el, opts)
    } catch {
      window.alert('No se pudo generar la imagen')
      return null
    } finally { setExportando(false) }
  }

  const nombreArchivo = `alerta-calidad-${numeroTxt(d.numero)}.png`
  async function descargar() {
    if (cambios && !(await guardar())) return
    const url = await generarPng()
    if (!url) return
    const a = document.createElement('a')
    a.href = url; a.download = nombreArchivo; a.click()
  }
  const puedeCompartir = typeof navigator !== 'undefined' && 'canShare' in navigator
  async function compartir() {
    if (cambios && !(await guardar())) return
    const url = await generarPng()
    if (!url) return
    const file = new File([await (await fetch(url)).blob()], nombreArchivo, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Alerta de Calidad N° ${numeroTxt(d.numero)}` }) } catch { /* cancelado */ }
    } else {
      const a = document.createElement('a'); a.href = url; a.download = nombreArchivo; a.click()
    }
  }
  const salir = () => { if (!cambios || window.confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) onSalir() }

  return (
    <div>
      <div className="section-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span className="code">⚠️</span>
          <h2>{id === null ? 'Nueva alerta' : 'Alerta'} N° {numeroTxt(d.numero)}</h2>
        </div>
        <button className="btn btn-ghost" onClick={salir}>← Volver a la lista</button>
      </div>

      <div className="ac-layout">
        <div>
          <div className="panel">
            <h3>Encabezado</h3>
            <div className="row">
              <Field label="N° de alerta"><input type="number" min={1} value={d.numero || ''} onChange={(e) => set('numero', Number(e.target.value))} /></Field>
              <Field label="Fecha"><input type="date" value={d.fecha} onChange={(e) => set('fecha', e.target.value)} /></Field>
            </div>
            <Field label="Área" hint="opcional"><input value={d.area} onChange={(e) => set('area', e.target.value)} placeholder="Ej: Formado de vasos" /></Field>
          </div>

          <div className="panel">
            <h3>Producto y defecto</h3>
            <Field label="Buscar en referencias" hint="llena producto y código">
              <ReferenceSearch referencias={refs} onChange={(rid) => {
                const r = refs.find((x) => x.id === rid)
                if (r) setD((x) => ({ ...x, producto: r.descripcion || r.codigo, codigo: r.descripcion ? r.codigo : x.codigo }))
                setCambios(true)
              }} freeText="" onFreeText={(t) => set('producto', t)} />
            </Field>
            <div className="row">
              <Field label="Producto"><input value={d.producto} onChange={(e) => set('producto', e.target.value)} placeholder="Ej: Vaso 7 oz blanco" /></Field>
              <Field label="Código" hint="opcional"><input value={d.codigo} onChange={(e) => set('codigo', e.target.value)} /></Field>
            </div>
            <Field label="Defecto principal (titular)">
              <input value={d.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej: Vaso con tapa picada" />
            </Field>
            {previasTitulo.length > 0 && <p className="ac-hint">↻ Este defecto ya se reportó para este producto en {listaNums(previasTitulo)}.</p>}
            <Field label="Tipo de alerta">
              <div className="ac-etq">
                {(['NUEVO', 'REINCIDENTE'] as const).map((t) => (
                  <button key={t} type="button" className={'optbtn' + (etiqueta === t ? ' sel' : '')}
                    onClick={() => { setEtiquetaManual(true); set('etiqueta', t) }}>{t === 'NUEVO' ? 'Nuevo' : 'Reincidente'}</button>
                ))}
                {etiquetaManual && etiqueta !== etiquetaSugerida && (
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '.8rem' }}
                    onClick={() => setEtiquetaManual(false)}>Usar sugerido ({etiquetaSugerida === 'NUEVO' ? 'Nuevo' : 'Reincidente'})</button>
                )}
              </div>
            </Field>
          </div>

          <div className="panel">
            <h3>Reclamo</h3>
            <Field label="Lo que reporta el cliente" hint="*texto* = negrita">
              <textarea rows={3} value={d.reporte} onChange={(e) => set('reporte', e.target.value)}
                placeholder="Ej: Problemas *dispensando los vasos 7 oz en máquinas vending*: el vaso no cae o se atasca." />
            </Field>
            <label style={{ fontWeight: 600, display: 'block', margin: '6px 0 8px' }}>Defectos detallados <span className="hint">· hasta 3</span></label>
            {d.defectos.map((x, i) => {
              const pv = x.titulo.trim() ? previas(x.titulo) : []
              return (
                <div key={i}>
                  <div className="ac-defrow">
                    <input className="ac-tit" value={x.titulo} placeholder={`Defecto ${i + 1} (ej: Reborde mal formado)`} onChange={(e) => setDef(i, { titulo: e.target.value })}
                      onBlur={() => { if (pv.length && x.estado === 'nuevo') setDef(i, { estado: 'sigue' }) }} />
                    <input className="ac-det" value={x.detalle} placeholder="Detalle (ej: Ya reportado antes)" onChange={(e) => setDef(i, { detalle: e.target.value })} />
                    <div className="ac-etq">
                      <button type="button" className={'optbtn' + (x.estado === 'nuevo' ? ' sel' : '')} onClick={() => setDef(i, { estado: 'nuevo' })}>Nuevo</button>
                      <button type="button" className={'optbtn' + (x.estado === 'sigue' ? ' sel' : '')} onClick={() => setDef(i, { estado: 'sigue' })}>Sigue</button>
                    </div>
                    <button type="button" className="btn btn-ghost pill-btn" title="Quitar" onClick={() => set('defectos', d.defectos.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  {pv.length > 0 && <p className="ac-hint">↻ Ya apareció en {listaNums(pv)}{x.estado === 'nuevo' ? ' — ¿marcarlo como "Sigue"?' : '.'}</p>}
                </div>
              )
            })}
            {d.defectos.length < 3 && (
              <button type="button" className="btn btn-ghost" onClick={() => set('defectos', [...d.defectos, { ...DEF_VACIO }])}>➕ Agregar defecto</button>
            )}
            <div style={{ marginTop: 12 }}>
              <Field label="Impacto" hint="opcional">
                <input value={d.impacto} onChange={(e) => set('impacto', e.target.value)} placeholder="Ej: el cliente no puede dispensar en sus máquinas vending" />
              </Field>
            </div>
          </div>

          <div className="panel">
            <h3>Foto de evidencia</h3>
            <input type="file" accept="image/*" onChange={(e) => elegirFoto(e.target.files?.[0])} />
            {foto && <p className="muted" style={{ fontSize: '.82rem' }}>La foto se recorta al cuadro de la imagen. Usa una foto donde el defecto esté centrado.</p>}
          </div>

          <div className="panel">
            <h3>¿Qué hacemos? <span className="hint" style={{ fontWeight: 400, fontSize: '.85rem' }}>· acciones para planta, hasta 3</span></h3>
            {d.acciones.map((x, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <input value={x} onChange={(e) => setAcc(i, e.target.value)} placeholder={`Acción ${i + 1}`} style={{ width: '100%' }} />
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Trazabilidad interna <span className="hint" style={{ fontWeight: 400, fontSize: '.85rem' }}>· no sale en la imagen</span></h3>
            <div className="row">
              <Field label="Cliente"><input value={d.cliente} onChange={(e) => set('cliente', e.target.value)} /></Field>
              <Field label="OP / Lote"><input value={d.op_lote} onChange={(e) => set('op_lote', e.target.value)} /></Field>
            </div>
          </div>
        </div>

        <div className="ac-preview">
          <div className="ac-scale" ref={cajaRef}>
            <AlertaImagen ref={imgRef} datos={datosImg} foto={foto} style={{ transform: `scale(${escala})` }} />
          </div>
          <div className="btn-row" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : cambios || id === null ? '💾 Guardar' : '✓ Guardada'}</button>
            <button className="btn" onClick={descargar} disabled={guardando || exportando}>{exportando ? 'Generando…' : '⬇️ Descargar PNG'}</button>
            {puedeCompartir && <button className="btn" onClick={compartir} disabled={guardando || exportando}>📤 Compartir</button>}
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>Al descargar o compartir se guardan primero los cambios.</p>
        </div>
      </div>
    </div>
  )
}
