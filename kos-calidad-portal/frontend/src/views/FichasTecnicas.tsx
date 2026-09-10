import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { getUser } from '../lib/auth'
import { matchKeywords } from '../lib/fuzzy'

type Ficha = {
  id: string; codigo: string; categoria: string; referencia: string
  plastificado: string; diam_inferior: string; rim: string
  diam_exterior: string; altura: string; archivo: string
}
type Campo = 'referencia' | 'categoria' | 'diam_inferior' | 'rim' | 'diam_exterior' | 'altura'
const VACIO = { referencia: '', categoria: '', diam_inferior: '', rim: '', diam_exterior: '', altura: '' }

export default function FichasTecnicas() {
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<Campo, string>>(VACIO)
  const admin = getUser()?.rol === 'admin'

  useEffect(() => {
    apiGet<Ficha[]>('/catalogos/fichas').then(setFichas).catch(() => {}).finally(() => setCargando(false))
  }, [])

  const empezar = (f: Ficha) => {
    setEditId(f.id)
    setEdit({ referencia: f.referencia, categoria: f.categoria, diam_inferior: f.diam_inferior, rim: f.rim, diam_exterior: f.diam_exterior, altura: f.altura })
  }
  const setCampo = (k: Campo, v: string) => setEdit((e) => ({ ...e, [k]: v }))

  async function guardar(f: Ficha) {
    const referencia = edit.referencia.trim()
    if (!referencia) return
    const body = { referencia, categoria: edit.categoria.trim(), diam_inferior: edit.diam_inferior.trim(), rim: edit.rim.trim(), diam_exterior: edit.diam_exterior.trim(), altura: edit.altura.trim() }
    try {
      await apiSend('PUT', `/catalogos/fichas/${f.id}`, body)
      setFichas((fs) => fs.map((x) => (x.id === f.id ? { ...x, ...body } : x)))
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
          <table className="ftable ftable-sticky">
            <thead>
              <tr>
                <th>Referencia</th><th>Categoría</th>
                <th>Diám. inferior (mm)</th><th>Rim (mm)</th><th>Diám. exterior (mm)</th><th>Altura (mm)</th>
                {admin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={cols} className="muted center" style={{ padding: 18 }}>Sin resultados.</td></tr>
              )}
              {filtradas.map((f, i) => {
                const editando = editId === f.id
                const teclas = (e: React.KeyboardEvent) => { if (e.key === 'Enter') guardar(f); if (e.key === 'Escape') setEditId(null) }
                const cel = (k: Campo, minW = 70) => editando
                  ? <input value={edit[k]} onChange={(e) => setCampo(k, e.target.value)} onKeyDown={teclas} style={{ font: 'inherit', width: '100%', minWidth: minW }} />
                  : (f[k] || '—')
                return (
                  <tr key={i}>
                    <td>
                      {editando ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input autoFocus value={edit.referencia} onChange={(e) => setCampo('referencia', e.target.value)} onKeyDown={teclas} style={{ font: 'inherit', minWidth: 140 }} />
                          <button className="btn btn-primary pill-btn" onClick={() => guardar(f)}>✓</button>
                          <button className="btn btn-ghost pill-btn" onClick={() => setEditId(null)}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <b>{f.referencia}</b>
                          {admin && <button className="btn btn-ghost pill-btn" title="Editar fila" onClick={() => empezar(f)}>✏️</button>}
                        </div>
                      )}
                      {f.codigo && <div className="muted" style={{ fontSize: '.74rem' }}>{f.codigo}</div>}
                    </td>
                    <td>{cel('categoria', 100)}</td>
                    <td>{cel('diam_inferior')}</td>
                    <td>{cel('rim')}</td>
                    <td>{cel('diam_exterior')}</td>
                    <td>{cel('altura')}</td>
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
