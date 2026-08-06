import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'

type Item = { dia_semana: number; turno: number; inicio: string; fin: string }
type Cell = { inicio: string; fin: string }

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DEF: [string, string][] = [['06:00', '14:00'], ['14:00', '22:00'], ['22:00', '06:00']]
const vacia = (): Cell[][] => DIAS.map(() => [0, 1, 2].map(() => ({ inicio: '', fin: '' })))
const porDefecto = (): Cell[][] => DIAS.map(() => DEF.map(([i, f]) => ({ inicio: i, fin: f })))

export default function TurnosConfig() {
  const [grid, setGrid] = useState<Cell[][]>(vacia())
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    apiGet<Item[]>('/turnos')
      .then((items) => {
        if (!items.length) { setGrid(porDefecto()); return }
        const g = vacia()
        for (const it of items) {
          if (it.dia_semana >= 0 && it.dia_semana < 7 && it.turno >= 1 && it.turno <= 3)
            g[it.dia_semana][it.turno - 1] = { inicio: it.inicio, fin: it.fin }
        }
        setGrid(g)
      })
      .catch(() => setGrid(porDefecto()))
  }, [])

  const flash = (m: string) => { setMsg(m); setErr(''); window.setTimeout(() => setMsg(''), 2500) }
  const set = (dia: number, t: number, campo: 'inicio' | 'fin', v: string) =>
    setGrid((g) => g.map((row, di) => di !== dia ? row : row.map((c, ti) => ti !== t ? c : { ...c, [campo]: v })))
  const copiarLunes = () => setGrid((g) => g.map(() => g[0].map((c) => ({ ...c }))))

  async function guardar() {
    setErr('')
    const horarios: Item[] = []
    for (let d = 0; d < 7; d++) {
      for (let t = 0; t < 3; t++) {
        const c = grid[d][t]
        if (c.inicio && c.fin) horarios.push({ dia_semana: d, turno: t + 1, inicio: c.inicio, fin: c.fin })
        else if (c.inicio || c.fin) { setErr(`Completa inicio y fin en ${DIAS[d]} · Turno ${t + 1} (o deja ambos vacíos).`); return }
      }
    }
    try { await apiSend('PUT', '/turnos', { horarios }); flash('Horarios guardados') } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <div>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>
          Define la hora de <strong>inicio</strong> y <strong>fin</strong> de cada turno por día. Con esto el
          sistema asigna automáticamente el turno de <strong>Liberación de rollos</strong> y <strong>Rutas Calidad</strong>
          {' '}según la hora del registro. Deja un turno vacío si ese día no aplica.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
          <button className="btn btn-ghost" onClick={copiarLunes}>Copiar Lunes a toda la semana</button>
        </div>
        <div className="table-wrap">
          <table className="turnos-tab">
            <thead>
              <tr><th>Día</th><th>Turno 1</th><th>Turno 2</th><th>Turno 3</th></tr>
            </thead>
            <tbody>
              {DIAS.map((dia, d) => (
                <tr key={dia}>
                  <td className="tdia">{dia}</td>
                  {[0, 1, 2].map((t) => (
                    <td key={t}>
                      <div className="turno-cell">
                        <input type="time" value={grid[d][t].inicio} onChange={(e) => set(d, t, 'inicio', e.target.value)} />
                        <span className="muted">–</span>
                        <input type="time" value={grid[d][t].fin} onChange={(e) => set(d, t, 'fin', e.target.value)} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err && <p className="tag-bad">{err}</p>}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={guardar}>Guardar horarios</button>
        </div>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
