// Selector de rango de fechas para las vistas de "Ver registros".
// Por defecto cargan los últimos 30 días (así no traen todo el historial y van
// rápido); el usuario puede ampliar el rango cuando necesite ver más atrás.

const fmtISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const hoyISO = () => fmtISO(new Date())
export const haceDiasISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fmtISO(d) }

export function RangoFechas({
  desde, hasta, setDesde, setHasta,
}: { desde: string; hasta: string; setDesde: (v: string) => void; setHasta: (v: string) => void }) {
  return (
    <div className="dash-filtros" style={{ marginBottom: 10 }}>
      <label className="fecha-in">Desde <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
      <label className="fecha-in">Hasta <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
      <span className="muted" style={{ fontSize: '.8rem' }}>Muestra los últimos 30 días por defecto; amplía el rango si necesitas ver más atrás.</span>
    </div>
  )
}
