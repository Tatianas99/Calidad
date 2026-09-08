import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { getUser } from '../lib/auth'
import { matchKeywords } from '../lib/fuzzy'

type Ficha = {
  id: string; codigo: string; categoria: string; referencia: string
  plastificado: string; diam_inferior: string; rim: string
  diam_exterior: string; altura: string; archivo: string
}

export default function FichasTecnicas() {
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editRef, setEditRef] = useState('')
  const [editCat, setEditCat] = useState('')
  const admin = getUser()?.rol === 'admin'

  useEffect(() => {
    apiGet<Ficha[]>('/catalogos/fichas').then(setFichas).catch(() => {}).finally(() => setCargando(false))
  }, [])

  const empezarEdicion = (f: Ficha) => { setEditId(f.id); setEditRef(f.referencia); setEditCat(f.categoria) }

  async function guardar(f: Ficha) {
    const referencia = editRef.trim()
    const categoria = editCat.trim()
    if (!referencia) return
    try {
      await apiSend('PUT', `/catalogos/fichas/${f.id}`, { referencia, categoria })
      setFichas((fs) => fs.map((x) => (x.id === f.id ? { ...x, referencia, categoria } : x)))
      setEditId(null)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  async function borrar(f: Ficha) {
    if (!window.confirm(`¿Borrar la ficha técnica "${f.referencia}"? Dejará de aparecer en la lista.`)) return
    try {
      await apiSend('DELETE', `/catalogos/fichas/${f.id}`)
      setFichas((fs) => fs.filter((x) => x.id !== f.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  const filtradas = useMemo(
    () => fichas.filter((f) => matchKeywords(q, `${f.referencia} ${f.categoria} ${f.codigo}`)),
    [fichas, q],
  )
  const cols = admin ? 7 : 6

  return (
    <div>
      <div className="section-title">
        <span className="code">📐</span>
        <h2>Fichas técnicas</h2>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Medidas de referencia (diámetros, rim y altura).</p>
      <input
        className="filt-search" style={{ maxWidth: 460, marginBottom: 12 }}
        type="search" placeholder="🔎 Buscar referencia (ej: 7 oz, cont, vaso)…"
        value={q} onChange={(e) => setQ(e.target.value)}
      />
      {cargando ? <p className="muted">Cargando…</p> : (
        <div className="table-wrap">
          <table className="ftable">
            <thead>
              <tr>
                <th>Referencia</th><th>Categoría</th>
                <th>Diám. inferior</th><th>Rim</th><th>Diám. exterior</th><th>Altura</th>
                {admin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={cols} className="muted center" style={{ padding: 18 }}>Sin resultados.</td></tr>
              )}
              {filtradas.map((f, i) => {
                const editando = editId === f.id
                return (
                  <tr key={i}>
                    <td>
                      {editando ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input autoFocus value={editRef} onChange={(e) => setEditRef(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') guardar(f); if (e.key === 'Escape') setEditId(null) }}
                            style={{ font: 'inherit', minWidth: 150 }} />
                          <button className="btn btn-primary pill-btn" onClick={() => guardar(f)}>✓</button>
                          <button className="btn btn-ghost pill-btn" onClick={() => setEditId(null)}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <b>{f.referencia}</b>
                          {admin && <button className="btn btn-ghost pill-btn" title="Editar referencia y categoría" onClick={() => empezarEdicion(f)}>✏️</button>}
                        </div>
                      )}
                      {f.codigo && <div className="muted" style={{ fontSize: '.74rem' }}>{f.codigo}</div>}
                    </td>
                    <td>
                      {editando
                        ? <input value={editCat} onChange={(e) => setEditCat(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') guardar(f); if (e.key === 'Escape') setEditId(null) }}
                            style={{ font: 'inherit', minWidth: 110 }} />
                        : (f.categoria || '—')}
                    </td>
                    <td>{f.diam_inferior || '—'}</td>
                    <td>{f.rim || '—'}</td>
                    <td>{f.diam_exterior || '—'}</td>
                    <td>{f.altura || '—'}</td>
                    {admin && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost pill-btn" title="Borrar ficha" onClick={() => borrar(f)}>🗑️</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: '.82rem' }}>{filtradas.length} de {fichas.length} fichas</p>
        </div>
      )}
    </div>
  )
}
