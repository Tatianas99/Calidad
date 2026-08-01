import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'
import { getUser } from '../lib/auth'
import FilterTable, { type Col } from '../components/FilterTable'
import RowActions from '../components/RowActions'
import type { PuntoMedicion, Persona, F015Medicion } from '../lib/types'

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

export default function RegistrosF015({ onEditar, onBack }: { onEditar?: (id: string) => void; onBack?: () => void }) {
  const [rows, setRows] = useState<F015Medicion[]>([])
  const [puntos, setPuntos] = useState<PuntoMedicion[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [cargando, setCargando] = useState(true)
  const admin = getUser()?.rol === 'admin'

  const cargar = () => {
    setCargando(true)
    // Sin ?fecha => todas las mediciones
    apiGet<F015Medicion[]>('/f015/mediciones')
      .then(setRows)
      .catch(() => {})
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    apiGet<PuntoMedicion[]>('/catalogos/puntos-medicion').then(setPuntos).catch(() => {})
    apiGet<Persona[]>('/catalogos/personas').then(setPersonas).catch(() => {})
    cargar()
  }, [])

  const puntoName = (id?: number | null) => (id ? puntos.find((p) => p.id === id)?.nombre ?? `#${id}` : '')
  const personaName = (id?: number | null) => (id ? personas.find((p) => p.id === id)?.nombre ?? `#${id}` : '—')

  async function borrar(r: F015Medicion) {
    if (!window.confirm('¿Borrar esta medición? Esta acción no se puede deshacer.')) return
    try {
      await apiSend('DELETE', `/f015/mediciones/${r.id}`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  const columns: Col<F015Medicion>[] = useMemo(() => [
    { key: 'fecha', label: 'Fecha y hora', value: (r) => fechaHora(r.fecha_hora) },
    { key: 'punto', label: 'Punto', value: (r) => r.punto_texto || puntoName(r.punto_medicion_id) },
    {
      key: 'ph', label: 'PH', value: (r) => String(r.ph),
      render: (r) => <span className={r.ph_en_rango ? 'tag-ok' : 'tag-bad'}>{r.ph}</span>,
    },
    {
      key: 'cloro', label: 'Cloro', value: (r) => String(r.cloro),
      render: (r) => <span className={r.cloro_en_rango ? 'tag-ok' : 'tag-bad'}>{r.cloro}</span>,
    },
    { key: 'estado', label: 'En rango', value: (r) => (r.ph_en_rango && r.cloro_en_rango ? 'sí ok' : 'no fuera') ,
      render: (r) => (r.ph_en_rango && r.cloro_en_rango) ? <span className="tag-ok">Sí</span> : <span className="tag-bad">No</span> },
    { key: 'responsable', label: 'Responsable', value: (r) => personaName(r.responsable_id) },
    { key: 'comentario', label: 'Comentario', value: (r) => r.comentario ?? '' },
    ...(admin ? [{
      key: 'acciones', label: '', noFilter: true, value: () => '',
      render: (r: F015Medicion) => (
        <RowActions
          onEdit={onEditar ? () => onEditar(r.id) : undefined}
          onDelete={() => borrar(r)}
        />
      ),
    } as Col<F015Medicion>] : []),
  ], [puntos, personas, onEditar, admin])

  return (
    <div>
      {onBack && <div className="btn-row" style={{ marginBottom: 6 }}><button className="btn btn-ghost" onClick={onBack}>← Reportes</button></div>}
      <div className="section-title">
        <span className="code">F-015</span>
        <h2>Registros de cloro y PH</h2>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', minHeight: 40 }} onClick={cargar}>↻ Actualizar</button>
      </div>
      {cargando ? <p className="muted">Cargando…</p> : (
        <FilterTable columns={columns} rows={rows} getKey={(r) => r.id} />
      )}
    </div>
  )
}
