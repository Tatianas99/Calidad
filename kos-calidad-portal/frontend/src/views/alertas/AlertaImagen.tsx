import { forwardRef, type ReactNode } from 'react'
import './alerta.css'

export type Defecto = { titulo: string; detalle: string; estado: 'nuevo' | 'sigue' }
export type AlertaDatos = {
  numero: number
  fecha: string // YYYY-MM-DD
  producto: string
  codigo: string
  titulo: string
  etiqueta: 'NUEVO' | 'REINCIDENTE'
  reporte: string
  area: string
  impacto: string
  defectos: Defecto[]
  acciones: string[]
  cliente: string
  op_lote: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} de ${MESES[m - 1]} de ${y}`
}

export const numeroTxt = (n: number) => String(n || 0).padStart(3, '0')

// "*texto*" en el reporte se muestra resaltado en negrita.
function conNegritas(txt: string): ReactNode[] {
  return txt.split(/(\*[^*]+\*)/g).map((p, i) =>
    p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b> : p,
  )
}

// Los textos largos se achican para que no se salgan de la tarjeta.
const tamTitulo = (t: string) => (t.length <= 24 ? 50 : t.length <= 32 ? 42 : t.length <= 40 ? 34 : 28)
const tamReporte = (t: string, nDef: number) => {
  const largo = t.length + nDef * 45
  return largo <= 150 ? 21 : largo <= 230 ? 19 : 17
}

const IcoAlerta = () => (
  <svg viewBox="0 0 24 24" fill="#16294A"><path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z" /></svg>
)
const IcoSigue = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#16294A" strokeWidth="2.4" strokeLinecap="round"><path d="M3 12c3-4 6 4 9 0s6 4 9 0" /></svg>
)
const IcoNuevo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v5M12 16h.01" /></svg>
)

/** La pieza gráfica de 1080×1080 que se descarga como PNG. */
const AlertaImagen = forwardRef<HTMLDivElement, { datos: AlertaDatos; foto: string | null; style?: React.CSSProperties }>(
  function AlertaImagen({ datos: a, foto, style }, ref) {
    const defectos = a.defectos.filter((d) => d.titulo.trim())
    const acciones = a.acciones.filter((x) => x.trim())
    const compacto = defectos.length >= 3
    return (
      <div className="ac-img" ref={ref} style={style}>
        <div className="ac-header">
          <div>
            <div className="ac-tag"><IcoAlerta />RECLAMO DE CLIENTE</div>
            <div className="ac-ttl"><h1>Alerta de Calidad</h1><span className="ac-num">N° {numeroTxt(a.numero)}</span></div>
            <div className="ac-meta">
              Fecha: <b>{fechaLarga(a.fecha)}</b>
              {a.area.trim() && <> &nbsp;·&nbsp; Área: <b>{a.area}</b></>}
            </div>
          </div>
          <div className="ac-logo"><img src="/logo-kos-alerta.png" alt="KOS Colombia" /></div>
        </div>

        <div className="ac-main">
          <div className="ac-prod">
            <span className={'ac-sev' + (a.etiqueta === 'NUEVO' ? ' nuevo' : '')}>{a.etiqueta}</span>
            <span className="ac-sub">
              {a.producto || 'Producto'}
              {a.codigo.trim() && <> &nbsp;·&nbsp; Código: {a.codigo}</>}
            </span>
          </div>
          <h2 style={{ fontSize: tamTitulo(a.titulo) }}>{a.titulo || 'Defecto principal'}</h2>

          <div className="ac-grid">
            <div className="ac-photo">
              {foto ? <img src={foto} alt="" /> : <div className="ac-nofoto">Sin foto</div>}
              {foto && <div className="ac-cap">📷 Evidencia del cliente</div>}
            </div>
            <div className="ac-card">
              <div className="ac-lbl">Lo que reporta el cliente</div>
              <p className="ac-quote" style={{ fontSize: tamReporte(a.reporte, defectos.length) }}>{conNegritas(a.reporte)}</p>
              {defectos.length > 0 && (
                <div className="ac-defs" style={compacto ? { marginTop: 14, gap: 8 } : undefined}>
                  {defectos.map((d, i) => (
                    <div key={i} className={'ac-def ' + d.estado} style={compacto ? { padding: '8px 14px' } : undefined}>
                      <div className="ac-ic">{d.estado === 'sigue' ? <IcoSigue /> : <IcoNuevo />}</div>
                      <div>
                        <div className="ac-t">{d.titulo}</div>
                        {d.detalle.trim() && <div className="ac-s">{d.detalle}</div>}
                      </div>
                      <span className="ac-pill">{d.estado === 'sigue' ? 'SIGUE' : 'NUEVO'}</span>
                    </div>
                  ))}
                </div>
              )}
              {a.impacto.trim() && <div className="ac-imp"><b>Impacto:</b> {a.impacto}</div>}
            </div>
          </div>

          {acciones.length > 0 && (
            <div className="ac-acts" style={{ gridTemplateColumns: `auto repeat(${acciones.length}, 1fr)` }}>
              <div className="ac-h">¿Qué<br />hacemos?</div>
              {acciones.map((x, i) => (
                <div key={i} className="ac-act"><span>{i + 1}</span>{x}</div>
              ))}
            </div>
          )}
        </div>

        <div className="ac-foot">
          <div className="ac-m">¡Calidad es <em>compromiso de todos!</em></div>
          <div className="ac-r">Sistema de Gestión de Inocuidad · KOS Colombia S.A.S.</div>
        </div>
      </div>
    )
  },
)

export default AlertaImagen
