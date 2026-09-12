import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { getUser } from '../lib/auth'
import { matchKeywords } from '../lib/fuzzy'
import { Field } from '../components/Field'

type Ficha = {
  id: string; codigo: string; categoria: string; referencia: string
  plastificado: string; diam_inferior: string; rim: string
  diam_exterior: string; altura: string; archivo: string
}
type Campo = 'referencia' | 'categoria' | 'diam_inferior' | 'rim' | 'diam_exterior' | 'altura'
const VACIO = { referencia: '', categoria: '', diam_inferior: '', rim: '', diam_exterior: '', altura: '' }
type NuevoCampo = 'referencia' | 'codigo' | 'categoria' | 'diam_inferior' | 'rim' | 'diam_exterior' | 'altura'
const NUEVO_VACIO = { referencia: '', codigo: '', categoria: '', diam_inferior: '', rim: '', diam_exterior: '', altura: '' }

export default function FichasTecnicas() {
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<Campo, string>>(VACIO)
  const [agregando, setAgregando] = useState(false)
  const [nuevo, setNuevo] = useState<Record<NuevoCampo, string>>(NUEVO_VACIO)
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

  const setNuevoCampo = (k: NuevoCampo, v: string) => setNuevo((n) => ({ ...n, [k]: v }))
  const cancelarNuevo = () => { setNuevo(NUEVO_VACIO); setAgregando(false) }

  async function guardarNuevo() {
    const referencia = nuevo.referencia.trim()
    if (!referencia) { window.alert('La referencia es obligatoria'); return }
    const body = {
      referencia, codigo: nuevo.codigo.trim(), categoria: nuevo.categoria.trim(),
      diam_inferior: nuevo.diam_inferior.trim(), rim: nuevo.rim.trim(),
      diam_exterior: nuevo.diam_exterior.trim(), altura: nuevo.altura.trim(),
    }
    try {
      const creada = await apiSend<Ficha>('POST', '/catalogos/fichas', body)
      setFichas((fs) => [creada, ...fs])
      setNuevo(NUEVO_VACIO); setAgregando(false); setQ('')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo agregar la ficha')
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
      <p className="muted" style={{ marginTop: 0 }}>
        Medidas de referencia (diámetros, rim y altura). Todas en <strong>mm</strong>, con tolerancia de <strong>± 2 mm</strong>.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          className="filt-search" style={{ maxWidth: 460, flex: '1 1 240px', margin: 0 }}
          type="search" placeholder="🔎 Buscar (ej: contenedor 7 oz, cont 7, vaso)…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        {admin && !agregando && (
          <button className="btn btn-primary" onClick={() => setAgregando(true)}>➕ Agregar ficha</button>
        )}
      </div>

      {admin && agregando && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Nueva ficha técnica</h3>
          <div className="row">
            <Field label="Referencia">
              <input autoFocus value={nuevo.referencia} onChange={(e) => setNuevoCampo('referencia', e.target.value)} placeholder="Ej: CONTENEDOR 7 OZ" />
            </Field>
            <Field label="Categoría">
              <input value={nuevo.categoria} onChange={(e) => setNuevoCampo('categoria', e.target.value)} placeholder="Ej: Contenedor" />
            </Field>
            <Field label="Código" hint="opcional">
              <input value={nuevo.codigo} onChange={(e) => setNuevoCampo('codigo', e.target.value)} />
            </Field>
          </div>
          <div className="row">
            <Field label="Diám. inferior (mm)"><input inputMode="decimal" value={nuevo.diam_inferior} onChange={(e) => setNuevoCampo('diam_inferior', e.target.value)} /></Field>
            <Field label="Rim (mm)"><input inputMode="decimal" value={nuevo.rim} onChange={(e) => setNuevoCampo('rim', e.target.value)} /></Field>
            <Field label="Diám. exterior (mm)"><input inputMode="decimal" value={nuevo.diam_exterior} onChange={(e) => setNuevoCampo('diam_exterior', e.target.value)} /></Field>
            <Field label="Altura (mm)"><input inputMode="decimal" value={nuevo.altura} onChange={(e) => setNuevoCampo('altura', e.target.value)} /></Field>
          </div>
          <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={cancelarNuevo}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarNuevo}>Guardar ficha</button>
          </div>
        </div>
      )}
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
