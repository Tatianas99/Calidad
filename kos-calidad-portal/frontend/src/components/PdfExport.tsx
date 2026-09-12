import { useState } from 'react'
import { apiBaseUrl } from '../lib/api'
import { getToken } from '../lib/auth'

// Valor para <input type="datetime-local"> (hora local, sin zona).
const isoLocal = (d: Date) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 16)
}
const inicioHoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return isoLocal(d) }

// Botón "PDF" con diálogo de rango (desde/hasta fecha-hora) que descarga el
// reporte del formato indicado en el rango elegido.
export default function PdfExport({ formato }: { formato: string }) {
  const [open, setOpen] = useState(false)
  const [desde, setDesde] = useState(inicioHoy())
  const [hasta, setHasta] = useState(isoLocal(new Date()))
  const [modo, setModo] = useState<'fecha' | 'op'>('fecha')  // solo F-006 usa 'op'
  const [op, setOp] = useState('')
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState('')

  const porOp = formato === 'f006' && modo === 'op'

  async function descargar() {
    setError('')
    if (porOp && !op.trim()) { setError('Escribe el número de OP'); return }
    setBajando(true)
    try {
      const url = porOp
        ? `${apiBaseUrl()}/reports/pdf/${formato}?op=${encodeURIComponent(op.trim())}`
        : `${apiBaseUrl()}/reports/pdf/${formato}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (res.status === 404) throw new Error(porOp ? 'No hay registros para esa OP' : 'No se pudo generar el PDF')
      if (!res.ok) throw new Error('No se pudo generar el PDF')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = porOp ? `reporte_${formato}_OP-${op.trim()}.pdf` : `reporte_${formato}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el PDF')
    } finally {
      setBajando(false)
    }
  }

  return (
    <>
      <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => setOpen(true)} title="Descargar reporte en PDF">📄 PDF</button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-panel pdf-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" title="Cerrar" onClick={() => setOpen(false)}>×</button>
            <div className="modal-body">
              <h3 style={{ marginTop: 0 }}>Descargar PDF</h3>

              {formato === 'f006' && (
                <div style={{ marginBottom: 12 }}>
                  <p className="muted" style={{ margin: '0 0 6px' }}>¿Cómo quieres el reporte?</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className={'btn ' + (modo === 'fecha' ? 'btn-primary' : 'btn-ghost')} onClick={() => { setModo('fecha'); setError('') }}>Por rango de fecha</button>
                    <button className={'btn ' + (modo === 'op' ? 'btn-primary' : 'btn-ghost')} onClick={() => { setModo('op'); setError('') }}>Por OP</button>
                  </div>
                </div>
              )}

              {porOp ? (
                <>
                  <label className="pdf-field">Número de OP
                    <input type="text" inputMode="numeric" autoFocus value={op} placeholder="Ej: 17305"
                      onChange={(e) => setOp(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') descargar() }} />
                  </label>
                  <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
                    Incluye todos los registros de esa OP, desde la primera vez que se usó hasta la última.
                  </p>
                </>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>Elige el rango de fecha y hora del reporte.</p>
                  <label className="pdf-field">Desde
                    <input type="datetime-local" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
                  </label>
                  <label className="pdf-field">Hasta
                    <input type="datetime-local" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
                  </label>
                </>
              )}

              {error && <p className="tag-bad">{error}</p>}
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}
                disabled={bajando || (porOp ? !op.trim() : (!desde || !hasta))} onClick={descargar}>
                {bajando ? 'Generando…' : 'Descargar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
