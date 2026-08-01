import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { Field } from '../components/Field'
import RowActions from '../components/RowActions'

type Item = { id: number; nombre: string; activo: boolean }

// CRUD genérico de una lista de nombres (proveedores de papel, puntos de medición…).
export default function CatalogoSimple({
  endpoint, singular, plural,
}: {
  endpoint: string       // p.ej. '/proveedores-papel'
  singular: string       // 'proveedor'
  plural: string         // 'Proveedores'
}) {
  const [lista, setLista] = useState<Item[]>([])
  const [nuevo, setNuevo] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const cargar = () => apiGet<Item[]>(endpoint).then(setLista).catch(() => {})
  useEffect(() => { cargar() /* eslint-disable-next-line */ }, [endpoint])

  const flash = (m: string) => { setMsg(m); setErr(''); window.setTimeout(() => setMsg(''), 2500) }
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : 'Error')

  async function crear() {
    setErr('')
    if (!nuevo.trim()) { setErr(`Escribe el nombre del ${singular}.`); return }
    try { await apiSend('POST', endpoint, { nombre: nuevo.trim() }); setNuevo(''); flash('Creado'); cargar() } catch (e) { fail(e) }
  }
  async function guardarEdicion(p: Item) {
    if (!editNombre.trim()) { setErr('El nombre no puede quedar vacío.'); return }
    try {
      const upd = await apiSend<Item>('PUT', `${endpoint}/${p.id}`, { nombre: editNombre.trim() })
      setLista((l) => l.map((x) => (x.id === p.id ? upd : x))); setEditId(null); flash('Actualizado')
    } catch (e) { fail(e) }
  }
  async function toggleActivo(p: Item) {
    try {
      const upd = await apiSend<Item>('PUT', `${endpoint}/${p.id}`, { activo: !p.activo })
      setLista((l) => l.map((x) => (x.id === p.id ? upd : x)))
    } catch (e) { fail(e) }
  }
  async function borrar(p: Item) {
    if (!window.confirm(`¿Borrar "${p.nombre}"?`)) return
    try { await apiSend('DELETE', `${endpoint}/${p.id}`); setLista((l) => l.filter((x) => x.id !== p.id)) } catch (e) { fail(e) }
  }

  return (
    <div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Nuevo</h3>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label={`Nombre del ${singular}`}>
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} />
          </Field>
          <button className="btn btn-accent" style={{ minHeight: 44 }} onClick={crear}>Agregar</button>
        </div>
        {err && <p className="tag-bad">{err}</p>}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{plural} ({lista.length})</h3>
        {lista.length === 0 && <p className="muted">Aún no hay registros.</p>}
        {lista.map((p) => (
          <div key={p.id} className={'user-row' + (p.activo ? '' : ' inactivo')}>
            <div className="user-head">
              {editId === p.id ? (
                <div className="row" style={{ flex: 1, alignItems: 'flex-end', margin: 0 }}>
                  <Field label="Nombre"><input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus /></Field>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => guardarEdicion(p)}>Guardar</button>
                    <button className="btn btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div><strong>{p.nombre}</strong>{!p.activo && <span className="tag-bad"> · inactivo</span>}</div>
                  <div className="user-actions">
                    <button className="btn btn-ghost" onClick={() => toggleActivo(p)}>{p.activo ? 'Desactivar' : 'Activar'}</button>
                    <RowActions onEdit={() => { setErr(''); setEditId(p.id); setEditNombre(p.nombre) }} onDelete={() => borrar(p)} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
