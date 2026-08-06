import { useEffect, useState } from 'react'
import { apiGet, apiMutate } from '../../lib/api'
import { useDraft } from '../../lib/draft'
import { uuid } from '../../lib/uuid'
import { getUser } from '../../lib/auth'
import { Field } from '../../components/Field'
import OptionButtons from '../../components/OptionButtons'
import SearchSelect from '../../components/SearchSelect'
import ComboBox from '../../components/ComboBox'
import OPSearch from '../../components/OPSearch'
import type { Referencia, Maquina, Persona, F204Registro } from '../../lib/types'

const RESULTADOS = ['C', 'NC', 'NA']
const hoy = () => new Date().toISOString().slice(0, 10)

type Entrada = {
  localId: string
  editId?: string
  fecha?: string          // solo admin puede editarla
  turno?: number
  orden_produccion?: string
  maquina?: string        // máquina (buscar/escribir)
  referencia_texto?: string  // referencia traída de la OP
  marca?: string
  cantidad_clase_b?: string
  verificacion?: string
  entregado_por_id?: number
  observaciones?: string
  createdAt: number
}
type State = { entradas: Entrada[]; seleccionadoId?: string }

export default function F204Form({
  onExit, editarId, onEditarConsumido,
}: {
  onExit: () => void
  editarId?: string | null
  onEditarConsumido?: () => void
}) {
  const [refs, setRefs] = useState<Referencia[]>([])
  const [maqs, setMaqs] = useState<Maquina[]>([])
  const [operarios, setOperarios] = useState<Persona[]>([])
  const [msg, setMsg] = useState('')
  const user = getUser()
  const admin = user?.rol === 'admin'

  const [st, setSt] = useDraft<State>('draft_f204_v1', { entradas: [] })

  useEffect(() => {
    apiGet<Referencia[]>('/catalogos/referencias').then(setRefs).catch(() => {})
    apiGet<Maquina[]>('/catalogos/maquinas').then(setMaqs).catch(() => {})
    apiGet<Persona[]>('/catalogos/personas?rol=operario').then(setOperarios).catch(() => {})
  }, [])

  // Edición pedida desde "Ver registros F-204": carga ese registro.
  useEffect(() => {
    if (!editarId) return
    apiGet<F204Registro>(`/f204/registros/${editarId}`)
      .then((r) => {
        setSt((s) => {
          if (s.entradas.some((e) => e.editId === r.id)) return { ...s, seleccionadoId: s.entradas.find((e) => e.editId === r.id)!.localId }
          const nueva: Entrada = {
            localId: uuid(), editId: r.id, fecha: r.fecha, turno: r.turno,
            orden_produccion: r.orden_produccion ?? undefined,
            maquina: r.maquina_texto ?? (r.maquina_id ? maqs.find((m) => m.id === r.maquina_id)?.nombre : undefined),
            referencia_texto: r.referencia_texto ?? (r.referencia_id ? refLabel(r.referencia_id) : undefined),
            marca: r.marca ?? undefined,
            cantidad_clase_b: r.cantidad_clase_b != null ? String(r.cantidad_clase_b) : undefined,
            verificacion: r.verificacion_desperdicio ?? undefined,
            entregado_por_id: r.entregado_por_id ?? undefined,
            observaciones: r.observaciones ?? undefined, createdAt: Date.now(),
          }
          return { ...s, entradas: [...s.entradas, nueva], seleccionadoId: nueva.localId }
        })
      })
      .catch(() => {})
      .finally(() => onEditarConsumido?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId])

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2800) }

  const refLabel = (id?: number) => {
    const r = refs.find((x) => x.id === id)
    return r ? (r.descripcion ? `${r.codigo} ${r.descripcion}` : r.codigo) : 'Sin referencia'
  }
  const selected = st.entradas.find((e) => e.localId === st.seleccionadoId)
  const patch = (id: string, p: Partial<Entrada>) =>
    setSt((s) => ({ ...s, entradas: s.entradas.map((e) => (e.localId === id ? { ...e, ...p } : e)) }))
  const upd = (p: Partial<Entrada>) => selected && patch(selected.localId, p)

  function agregar() {
    const nueva: Entrada = { localId: uuid(), fecha: hoy(), createdAt: Date.now() }
    setSt((s) => ({ ...s, entradas: [...s.entradas, nueva], seleccionadoId: nueva.localId }))
  }
  function quitar(id: string) {
    if (!window.confirm('¿Quitar esta entrada? (si no la has guardado, se pierde lo capturado)')) return
    setSt((s) => {
      const entradas = s.entradas.filter((e) => e.localId !== id)
      return { ...s, entradas, seleccionadoId: s.seleccionadoId === id ? entradas[0]?.localId : s.seleccionadoId }
    })
  }

  const faltan = (e: Entrada): string[] => {
    const f: string[] = []
    if (!e.turno) f.push('Turno')
    if (!e.maquina || !e.maquina.trim()) f.push('Máquina')
    if (!e.referencia_texto || !e.referencia_texto.trim()) f.push('Referencia')
    if (!e.entregado_por_id) f.push('Entregado por')
    return f
  }

  async function finalizar(e: Entrada) {
    if (faltan(e).length) { flash(`Faltan campos: ${faltan(e).join(', ')}`); return }
    const body = {
      turno: e.turno, orden_produccion: e.orden_produccion ?? null, maquina_texto: e.maquina ?? null,
      referencia_texto: e.referencia_texto ?? null, marca: e.marca ?? null,
      cantidad_clase_b: e.cantidad_clase_b != null && e.cantidad_clase_b !== '' ? Number(e.cantidad_clase_b) : null,
      verificacion_desperdicio: e.verificacion ?? null,
      entregado_por_id: e.entregado_por_id ?? null,
      observaciones: e.observaciones ?? null,
      ...(admin ? { fecha: e.fecha || hoy() } : {}),
    }
    const r = e.editId
      ? await apiMutate('PUT', `/f204/registros/${e.editId}`, body)
      : await apiMutate('POST', '/f204/registros', { id: e.localId, ...body })
    setSt((s) => {
      const entradas = s.entradas.filter((x) => x.localId !== e.localId)
      return { ...s, entradas, seleccionadoId: s.seleccionadoId === e.localId ? entradas[0]?.localId : s.seleccionadoId }
    })
    flash(r.ok ? (e.editId ? 'Registro actualizado ✔' : 'Registro guardado ✔') : 'Guardado (pendiente de sincronizar)')
  }

  const resumen = (e: Entrada) =>
    (e.turno ? `T${e.turno}` : 'Sin turno') + ' · ' + (e.maquina || 'Sin máquina')

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <button className="btn btn-ghost" onClick={onExit}>← Ir al inicio</button>
      </div>
      <div className="section-title">
        <span className="code">F-204</span>
        <h2>Clase B y desperdicio</h2>
        {user && <span className="muted" style={{ marginLeft: 'auto' }}>Recibido por: <strong>{user.nombre}</strong> · {new Date().toLocaleDateString('es-CO')}</span>}
      </div>

      <div className="f006-layout">
        <aside className="side">
          <button className="add" onClick={agregar}>AGREGAR +</button>
          <h4>Entradas del turno ({st.entradas.length})</h4>
          <div className="prod-list">
            {st.entradas.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Presiona AGREGAR + para iniciar.</p>}
            {st.entradas.map((e) => (
              <button
                key={e.localId}
                className={'prod-item' + (e.localId === st.seleccionadoId ? ' sel' : '')}
                onClick={() => setSt((s) => ({ ...s, seleccionadoId: e.localId }))}
              >
                <span className="pt">{e.referencia_texto ? e.referencia_texto + (e.marca ? ` ${e.marca}` : '') : 'Nueva entrega'}</span>
                <span className="pm">{resumen(e)}{e.editId ? ' · editando' : ' · sin guardar'}</span>
                <span className="quitar-x" title="Quitar" onClick={(ev) => { ev.stopPropagation(); quitar(e.localId) }}>×</span>
              </button>
            ))}
          </div>
        </aside>

        <section>
          {!selected ? (
            <div className="panel prod-empty">
              <p>Selecciona una entrada o presiona <strong>AGREGAR +</strong> para registrar una entrega.</p>
              <button className="btn btn-primary" onClick={agregar}>AGREGAR +</button>
            </div>
          ) : (
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>{selected.referencia_texto ? selected.referencia_texto + (selected.marca ? ` ${selected.marca}` : '') : 'Nueva entrega'}</h3>
              <div className="row">
                {admin && (
                  <Field label="Fecha" hint="editable (solo admin)">
                    <input type="date" value={selected.fecha ?? hoy()} onChange={(e) => upd({ fecha: e.target.value })} />
                  </Field>
                )}
                <Field label="Turno">
                  <select value={selected.turno ?? ''} onChange={(e) => upd({ turno: Number(e.target.value) })}>
                    <option value="">Seleccionar…</option>
                    {[1, 2, 3].map((t) => <option key={t} value={t}>Turno {t}</option>)}
                  </select>
                </Field>
                <Field label="Máquina" hint="buscar o escribir">
                  <ComboBox value={selected.maquina ?? ''} onChange={(v) => upd({ maquina: v })} options={maqs.map((m) => m.nombre)} placeholder="Buscar o escribir máquina…" />
                </Field>
                <Field label="Orden de producción" hint="trae referencia y marca">
                  <OPSearch
                    value={selected.orden_produccion ?? ''}
                    onChange={(v) => upd({ orden_produccion: v })}
                    onResolve={(o) => upd({ referencia_texto: o.referencia, marca: o.marca })}
                  />
                </Field>
              </div>

              <div className="row">
                <Field label="Referencia" hint="se llena con la OP">
                  <input value={selected.referencia_texto ?? ''} onChange={(e) => upd({ referencia_texto: e.target.value })} placeholder="Se autollena al elegir la OP" />
                </Field>
                <Field label="Marca" hint="se llena con la OP">
                  <input value={selected.marca ?? ''} onChange={(e) => upd({ marca: e.target.value })} placeholder="Se autollena al elegir la OP" />
                </Field>
              </div>

              <div className="row">
                <Field label="Cantidad Clase B" hint="unidades">
                  <input type="number" min={0} inputMode="numeric" value={selected.cantidad_clase_b ?? ''} onChange={(e) => upd({ cantidad_clase_b: e.target.value })} />
                </Field>
                <Field label="Verificación de desperdicio">
                  <OptionButtons options={RESULTADOS.map((r) => ({ value: r, label: r }))} value={selected.verificacion} onChange={(v) => upd({ verificacion: v })} />
                </Field>
              </div>

              <div className="row">
                <Field label="Entregado por" hint="busca por nombre (operarios)">
                  <SearchSelect
                    items={operarios.map((p) => ({ id: p.id, label: p.nombre }))}
                    value={selected.entregado_por_id}
                    onChange={(id) => upd({ entregado_por_id: id })}
                    placeholder="Buscar operario…"
                  />
                </Field>
                <Field label="Recibido por" hint="usuario en sesión">
                  <input type="text" value={user?.nombre ?? ''} readOnly tabIndex={-1} style={{ background: 'var(--surface-2)' }} />
                </Field>
              </div>

              <Field label="Observaciones">
                <textarea value={selected.observaciones ?? ''} onChange={(e) => upd({ observaciones: e.target.value })} />
              </Field>

              {faltan(selected).length > 0 && (
                <p className="tag-bad">⚠ Faltan: {faltan(selected).join(', ')}.</p>
              )}
              <div className="btn-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" disabled={faltan(selected).length > 0} onClick={() => finalizar(selected)}>
                  {selected.editId ? 'Actualizar registro' : 'Finalizar y guardar'}
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
