import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend, apiBaseUrl } from '../lib/api'
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
  const [ver, setVer] = useState<Ficha | null>(null)   // ficha en visor (PDF)
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const admin = getUser()?.rol === 'admin'

  useEffect(() => {
    apiGet<Ficha[]>('/catalogos/fichas').then(setFichas).catch(() => {}).finally(() => setCargando(false))
  }, [])

  async function guardarNombre(f: Ficha) {
    const nombre = editVal.trim()
    if (!nombre) return
    try {
      await apiSend('PUT', `/catalogos/fichas/${f.id}`, { referencia: nombre })
      setFichas((fs) => fs.map((x) => (x.id === f.id ? { ...x, referencia: nombre } : x)))
      setEditId(null)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const filtradas = useMemo(
    () => fichas.filter((f) => matchKeywords(q, `${f.referencia} ${f.categoria} ${f.codigo}`)),
    [fichas, q],
  )

  const abrir = (f: Ficha) => {
    if (!f.archivo) return
    if (f.archivo.toLowerCase().endsWith('.pdf')) setVer(f)   // PDF: visor dentro de la app
    else window.open(apiBaseUrl() + f.archivo, '_blank')      // Excel: descarga/abre aparte
  }

  return (
    <div>
      <div className="section-title">
        <span className="code">📐</span>
        <h2>Fichas técnicas</h2>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Medidas de referencia (diámetros, rim y altura). Usa la lupa 🔍 para ver la ficha completa con el plano.</p>
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
                <th>Referencia</th><th>Categoría</th><th>Plastificado</th>
                <th>Diám. inferior</th><th>Rim</th><th>Diám. exterior</th><th>Altura</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={8} className="muted center" style={{ padding: 18 }}>Sin resultados.</td></tr>
              )}
              {filtradas.map((f, i) => (
                <tr key={i}>
                  <td>
                    {editId === f.id ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') guardarNombre(f); if (e.key === 'Escape') setEditId(null) }}
                          style={{ font: 'inherit', minWidth: 150 }} />
                        <button className="btn btn-primary pill-btn" onClick={() => guardarNombre(f)}>✓</button>
                        <button className="btn btn-ghost pill-btn" onClick={() => setEditId(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <b>{f.referencia}</b>
                        {admin && <button className="btn btn-ghost pill-btn" title="Editar nombre" onClick={() => { setEditId(f.id); setEditVal(f.referencia) }}>✏️</button>}
                      </div>
                    )}
                    {f.codigo && <div className="muted" style={{ fontSize: '.74rem' }}>{f.codigo}</div>}
                  </td>
                  <td>{f.categoria}</td>
                  <td>{f.plastificado || '—'}</td>
                  <td>{f.diam_inferior || '—'}</td>
                  <td>{f.rim || '—'}</td>
                  <td>{f.diam_exterior || '—'}</td>
                  <td>{f.altura || '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {f.archivo
                      ? <button className="btn btn-ghost pill-btn" title="Ver ficha técnica" onClick={() => abrir(f)}>🔍</button>
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: '.82rem' }}>{filtradas.length} de {fichas.length} fichas</p>
        </div>
      )}

      {ver && (
        <div className="modal-backdrop" onClick={() => setVer(null)}>
          <div className="modal-panel ft-visor" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" title="Cerrar" onClick={() => setVer(null)}>×</button>
            <div className="ft-visor-head">
              <strong>{ver.referencia}</strong> · {ver.codigo}
              <a className="btn btn-ghost pill-btn" href={apiBaseUrl() + ver.archivo} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', textDecoration: 'none' }}>Abrir aparte ↗</a>
            </div>
            <iframe title="Ficha técnica" src={apiBaseUrl() + ver.archivo} className="ft-iframe" />
          </div>
        </div>
      )}
    </div>
  )
}
