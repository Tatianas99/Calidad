import { useEffect, useState } from 'react'
import { apiBaseUrl, apiGet } from '../lib/api'
import { getToken, getUser } from '../lib/auth'

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
  const [proceso, setProceso] = useState('')  // '' = todos (solo F-158)
  const [procesos, setProcesos] = useState<{ key: string; label: string }[]>([])
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState('')

  const admiteOp = formato === 'f006' || formato === 'f158'  // reporte por OP
  const porOp = admiteOp && modo === 'op'
  const admiteProceso = formato === 'f158'  // filtro por proceso (solo por rango de fecha)
  const admin = getUser()?.rol === 'admin'

  // Carga los procesos de F-158 para poder filtrar el reporte por proceso.
  // Los procesos solo-admin (p. ej. Anillos) se ocultan a usuarios normales.
  useEffect(() => {
    if (!admiteProceso) return
    apiGet<{ procesos: { key: string; label: string; solo_admin?: boolean }[] }>('/f158/config')
      .then((c) => setProcesos((c.procesos || []).filter((p) => admin || !p.solo_admin)))
      .catch(() => {})
  }, [admiteProceso, admin])

  async function descargar() {
    setError('')
    if (porOp && !op.trim()) { setError('Escribe el número de OP'); return }
    setBajando(true)
    try {
      const procParam = admiteProceso && proceso ? `&proceso=${encodeURIComponent(proceso)}` : ''
      const url = porOp
        ? `${apiBaseUrl()}/reports/pdf/${formato}?op=${encodeURIComponent(op.trim())}`
        : `${apiBaseUrl()}/reports/pdf/${formato}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${procParam}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (res.status === 404) throw new Error(porOp ? 'No hay registros para esa OP' : 'No se pudo generar el PDF')
      if (!res.ok) throw new Error('No se pudo generar el PDF')
      const blob = await res.blob()
      const procTxt = admiteProceso && proceso ? '_' + (procesos.find((p) => p.key === proceso)?.label || proceso) : ''
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = porOp ? `reporte_${formato}_OP-${op.trim()}.pdf` : `reporte_${formato}${procTxt}.pdf`
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

              {admiteOp && (
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
                  {admiteProceso && (
                    <label className="pdf-field">Proceso
                      <select value={proceso} onChange={(e) => setProceso(e.target.value)}>
                        <option value="">Todos los procesos</option>
                        {procesos.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </label>
                  )}
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
