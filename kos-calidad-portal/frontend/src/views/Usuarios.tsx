import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { Field } from '../components/Field'
import type { Usuario } from '../lib/auth'

type Meta = { roles: string[]; permisos: { value: string; label: string }[] }

export default function Usuarios() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [lista, setLista] = useState<Usuario[]>([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // formulario nuevo usuario
  const [nu, setNu] = useState({ username: '', nombre: '', password: '', rol: 'operario', permisos: [] as string[] })

  // edición de un usuario existente (usuario + nombre)
  const [editId, setEditId] = useState<number | null>(null)
  const [ed, setEd] = useState({ username: '', nombre: '' })

  // asignar nueva contraseña (visible para poder anotarla)
  const [pwId, setPwId] = useState<number | null>(null)
  const [pwVal, setPwVal] = useState('')

  const cargar = () => apiGet<Usuario[]>('/usuarios').then(setLista).catch(() => {})

  useEffect(() => {
    apiGet<Meta>('/usuarios/meta').then(setMeta).catch(() => {})
    cargar()
  }, [])

  const flash = (m: string) => { setMsg(m); setErr(''); window.setTimeout(() => setMsg(''), 2500) }
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : 'Error')

  async function crear() {
    setErr('')
    if (!nu.username || !nu.nombre || nu.password.length < 4) { setErr('Completa usuario, nombre y contraseña (mín. 4).'); return }
    try {
      await apiSend('POST', '/usuarios', nu)
      setNu({ username: '', nombre: '', password: '', rol: 'operario', permisos: [] })
      flash('Usuario creado')
      cargar()
    } catch (e) { fail(e) }
  }

  async function actualizar(u: Usuario, patch: Partial<Usuario>) {
    try {
      const upd = await apiSend<Usuario>('PUT', `/usuarios/${u.id}`, patch)
      setLista((l) => l.map((x) => (x.id === u.id ? upd : x)))
      flash('Actualizado')
    } catch (e) { fail(e) }
  }

  function abrirPassword(u: Usuario) { setErr(''); setEditId(null); setPwId(u.id); setPwVal('') }
  async function guardarPassword(u: Usuario) {
    if (pwVal.length < 4) { setErr('La contraseña debe tener al menos 4 caracteres.'); return }
    try {
      await apiSend('POST', `/usuarios/${u.id}/password`, { password: pwVal })
      setPwId(null); setPwVal(''); flash(`Contraseña de @${u.username} actualizada`)
    } catch (e) { fail(e) }
  }

  function abrirEdicion(u: Usuario) { setErr(''); setEditId(u.id); setEd({ username: u.username, nombre: u.nombre }) }
  async function guardarEdicion(u: Usuario) {
    if (!ed.username.trim() || !ed.nombre.trim()) { setErr('Usuario y nombre no pueden quedar vacíos.'); return }
    try {
      const upd = await apiSend<Usuario>('PUT', `/usuarios/${u.id}`, { username: ed.username.trim(), nombre: ed.nombre.trim() })
      setLista((l) => l.map((x) => (x.id === u.id ? upd : x)))
      setEditId(null)
      flash('Datos actualizados')
    } catch (e) { fail(e) }
  }

  const togglePermisoNuevo = (p: string) =>
    setNu((s) => ({ ...s, permisos: s.permisos.includes(p) ? s.permisos.filter((x) => x !== p) : [...s.permisos, p] }))

  const togglePermisoUsuario = (u: Usuario, p: string) => {
    const permisos = u.permisos.includes(p) ? u.permisos.filter((x) => x !== p) : [...u.permisos, p]
    actualizar(u, { permisos })
  }

  return (
    <div>
      {/* Crear usuario */}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Nuevo usuario</h3>
        <div className="row">
          <Field label="Usuario"><input value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></Field>
          <Field label="Nombre"><input value={nu.nombre} onChange={(e) => setNu({ ...nu, nombre: e.target.value })} /></Field>
          <Field label="Contraseña"><input type="text" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field>
          <Field label="Rol">
            <select value={nu.rol} onChange={(e) => setNu({ ...nu, rol: e.target.value })}>
              {(meta?.roles ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        {nu.rol !== 'admin' && (
          <Field label="Permisos">
            <div className="perm-list">
              {(meta?.permisos ?? []).map((p) => (
                <label key={p.value} className="perm">
                  <input type="checkbox" checked={nu.permisos.includes(p.value)} onChange={() => togglePermisoNuevo(p.value)} />
                  {p.label}
                </label>
              ))}
            </div>
          </Field>
        )}
        {nu.rol === 'admin' && <p className="muted">El rol admin tiene todos los permisos.</p>}
        {err && <p className="tag-bad">{err}</p>}
        <button className="btn btn-accent" onClick={crear}>Crear usuario</button>
      </div>

      {/* Lista de usuarios */}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Usuarios ({lista.length})</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Puedes editar usuario, nombre, rol y permisos. La contraseña actual <strong>no se puede ver</strong>
          {' '}(queda cifrada por seguridad); con <strong>Contraseña</strong> asignas una nueva y esa sí
          queda visible para que la anotes y se la des al usuario.
        </p>
        {lista.map((u) => (
          <div key={u.id} className={'user-row' + (u.activo ? '' : ' inactivo')}>
            <div className="user-head">
              <div>
                <strong>{u.nombre}</strong> <span className="muted">@{u.username}</span>
                {!u.activo && <span className="tag-bad"> · inactivo</span>}
              </div>
              <div className="user-actions">
                <select value={u.rol} onChange={(e) => actualizar(u, { rol: e.target.value })}>
                  {(meta?.roles ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn btn-ghost" onClick={() => (editId === u.id ? setEditId(null) : abrirEdicion(u))}>
                  {editId === u.id ? 'Cerrar' : 'Editar'}
                </button>
                <button className="btn btn-ghost" onClick={() => (pwId === u.id ? setPwId(null) : abrirPassword(u))}>Contraseña</button>
                <button className="btn btn-ghost" onClick={() => actualizar(u, { activo: !u.activo })}>
                  {u.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>

            {editId === u.id && (
              <div className="row" style={{ margin: '8px 0 4px' }}>
                <Field label="Usuario"><input value={ed.username} onChange={(e) => setEd({ ...ed, username: e.target.value })} /></Field>
                <Field label="Nombre"><input value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} /></Field>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => guardarEdicion(u)}>Guardar</button>
                  <button className="btn btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                </div>
              </div>
            )}

            {pwId === u.id && (
              <div className="row" style={{ margin: '8px 0 4px' }}>
                <Field label="Nueva contraseña" hint="visible: anótala para dársela al usuario">
                  <input type="text" value={pwVal} onChange={(e) => setPwVal(e.target.value)} placeholder="mín. 4 caracteres" autoFocus />
                </Field>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => guardarPassword(u)}>Guardar</button>
                  <button className="btn btn-ghost" onClick={() => setPwId(null)}>Cancelar</button>
                </div>
              </div>
            )}
            {u.rol !== 'admin' ? (
              <div className="perm-list">
                {(meta?.permisos ?? []).map((p) => (
                  <label key={p.value} className="perm">
                    <input type="checkbox" checked={u.permisos.includes(p.value)} onChange={() => togglePermisoUsuario(u, p.value)} />
                    {p.label}
                  </label>
                ))}
              </div>
            ) : <p className="muted" style={{ margin: '4px 0 0' }}>Todos los permisos (admin).</p>}
          </div>
        ))}
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
