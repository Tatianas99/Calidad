import { useEffect, useState } from 'react'
import { apiGet, apiMutate } from '../../lib/api'
import { uuid } from '../../lib/uuid'
import { getUser } from '../../lib/auth'
import { Field } from '../../components/Field'
import SearchSelect from '../../components/SearchSelect'
import type { Persona, PuntoMedicion, F015Medicion } from '../../lib/types'

const PH_MIN = 6.5, PH_MAX = 8.5
const CLORO_MIN = 0.3, CLORO_MAX = 2
const hoy = () => new Date().toISOString().slice(0, 10)

export default function F015Form({
  onExit, editarId, onEditarConsumido,
}: {
  onExit: () => void
  editarId?: string | null
  onEditarConsumido?: () => void
}) {
  const [puntos, setPuntos] = useState<PuntoMedicion[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [lista, setLista] = useState<F015Medicion[]>([])
  const [msg, setMsg] = useState('')

  const admin = getUser()?.rol === 'admin'
  const [fechaManual, setFechaManual] = useState(hoy())
  const [editId, setEditId] = useState<string | null>(null)
  const [puntoId, setPuntoId] = useState('')
  const [ph, setPh] = useState('')
  const [cloro, setCloro] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [comentario, setComentario] = useState('')

  const cargarLista = () =>
    apiGet<F015Medicion[]>(`/f015/mediciones?fecha=${hoy()}`).then(setLista).catch(() => {})

  useEffect(() => {
    apiGet<PuntoMedicion[]>('/catalogos/puntos-medicion').then(setPuntos).catch(() => {})
    apiGet<Persona[]>('/catalogos/personas').then(setPersonas).catch(() => {})
    cargarLista()
  }, [])

  // Edición pedida desde "Ver registros F-015": precarga la medición.
  useEffect(() => {
    if (!editarId) return
    apiGet<F015Medicion>(`/f015/mediciones/${editarId}`)
      .then((m) => {
        setEditId(m.id)
        setPuntoId(String(m.punto_medicion_id))
        setPh(String(m.ph))
        setCloro(String(m.cloro))
        setResponsableId(m.responsable_id ? String(m.responsable_id) : '')
        setComentario(m.comentario ?? '')
      })
      .catch(() => {})
      .finally(() => onEditarConsumido?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId])

  const cancelarEdicion = () => {
    setEditId(null); setPuntoId(''); setPh(''); setCloro(''); setResponsableId(''); setComentario('')
  }

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2500) }

  const phNum = parseFloat(ph)
  const cloroNum = parseFloat(cloro)
  const phFuera = ph !== '' && (phNum < PH_MIN || phNum > PH_MAX)
  const cloroFuera = cloro !== '' && (cloroNum < CLORO_MIN || cloroNum > CLORO_MAX)

  async function guardar() {
    if (!puntoId || ph === '' || cloro === '') { flash('Completa punto, PH y cloro'); return }
    const body = {
      punto_medicion_id: Number(puntoId),
      ph: phNum,
      cloro: cloroNum,
      responsable_id: responsableId ? Number(responsableId) : null,
      comentario: comentario || null,
    }
    if (editId) {
      const r = await apiMutate('PUT', `/f015/mediciones/${editId}`, body)
      flash(r.ok ? 'Medición actualizada ✔' : 'Actualizada (pendiente de sincronizar)')
      cancelarEdicion()
    } else {
      const r = await apiMutate('POST', '/f015/mediciones', { id: uuid(), ...body, ...(admin ? { fecha: fechaManual } : {}) })
      flash(r.ok ? 'Medición guardada' : 'Guardada (pendiente de sincronizar)')
      setPh(''); setCloro(''); setComentario('')
    }
    cargarLista()
  }

  const nombrePunto = (id: number) => puntos.find((p) => p.id === id)?.nombre ?? `#${id}`

  return (
    <div className="narrow">
      <div className="section-title">
        <span className="code">F-015</span>
        <h2>Medición de cloro y PH del agua</h2>
      </div>

      <div className="panel">
        {editId && (
          <p className="tag-warn" style={{ marginTop: 0 }}>
            ✎ Editando una medición existente. <button className="btn btn-ghost pill-btn" onClick={cancelarEdicion}>Cancelar edición</button>
          </p>
        )}
        <p className="muted" style={{ marginTop: 0 }}>
          Rangos esperados: <strong>PH 6.5 – 8.5</strong> · <strong>Cloro 0.3 – 2</strong>. La fecha y hora las registra el sistema.
        </p>
        {admin && !editId && (
          <Field label="Fecha" hint="editable (solo admin) · para alimentar manualmente">
            <input type="date" value={fechaManual} onChange={(e) => setFechaManual(e.target.value)} />
          </Field>
        )}
        <div className="row">
          <Field label="Punto de medición">
            <select value={puntoId} onChange={(e) => setPuntoId(e.target.value)}>
              <option value="">Seleccionar…</option>
              {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Field>
          <Field label="Responsable" hint="busca por nombre">
            <SearchSelect
              items={personas.map((p) => ({ id: p.id, label: p.nombre }))}
              value={responsableId ? Number(responsableId) : undefined}
              onChange={(id) => setResponsableId(String(id))}
              placeholder="Buscar responsable…"
            />
          </Field>
          <Field label="PH" hint="6.5 – 8.5">
            <input type="number" step="0.1" inputMode="decimal" value={ph}
              onChange={(e) => setPh(e.target.value)}
              style={phFuera ? { borderColor: 'var(--bad)', background: 'var(--bad-bg)' } : undefined} />
          </Field>
          <Field label="Cloro" hint="0.3 – 2">
            <input type="number" step="0.1" inputMode="decimal" value={cloro}
              onChange={(e) => setCloro(e.target.value)}
              style={cloroFuera ? { borderColor: 'var(--bad)', background: 'var(--bad-bg)' } : undefined} />
          </Field>
        </div>
        {(phFuera || cloroFuera) && (
          <p className="tag-bad">⚠ Valor fuera de rango: {phFuera ? 'PH ' : ''}{cloroFuera ? 'Cloro' : ''}</p>
        )}
        <Field label="Comentario">
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </Field>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onExit}>Ir al inicio</button>
          <button className="btn btn-primary" onClick={guardar}>{editId ? 'Actualizar medición' : 'Guardar medición'}</button>
        </div>
      </div>

      <div className="panel">
        <h3>Mediciones de hoy ({lista.length})</h3>
        {lista.length === 0 && <p className="muted">Aún no hay mediciones registradas hoy.</p>}
        {lista.map((m) => (
          <div className="list-item" key={m.id}>
            <div>
              <strong>{nombrePunto(m.punto_medicion_id)}</strong>
              <div className="muted">{new Date(m.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={m.ph_en_rango ? 'tag-ok' : 'tag-bad'}>PH {m.ph}</div>
              <div className={m.cloro_en_rango ? 'tag-ok' : 'tag-bad'}>Cloro {m.cloro}</div>
            </div>
          </div>
        ))}
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
