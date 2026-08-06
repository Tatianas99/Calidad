import { useState } from 'react'
import Usuarios from './Usuarios'
import CatalogoSimple from './CatalogoSimple'
import TurnosConfig from './TurnosConfig'

type Tab = 'usuarios' | 'proveedores' | 'puntos' | 'turnos'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'usuarios', label: 'Usuarios', icon: '👤' },
  { key: 'proveedores', label: 'Proveedores papel', icon: '📄' },
  { key: 'puntos', label: 'Puntos de medición', icon: '📍' },
  { key: 'turnos', label: 'Turnos', icon: '🕐' },
]

export default function Configuracion() {
  const [tab, setTab] = useState<Tab>('usuarios')

  return (
    <div>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Configuración</h1>
      <p className="muted" style={{ marginTop: 0 }}>{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      <div className="cfg-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'cfg-tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            <span className="cfg-tab-ico">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'usuarios' && <Usuarios />}
        {tab === 'proveedores' && <CatalogoSimple endpoint="/proveedores-papel" singular="proveedor" plural="Proveedores de papel" />}
        {tab === 'puntos' && <CatalogoSimple endpoint="/puntos-medicion" singular="punto de medición" plural="Puntos de medición" />}
        {tab === 'turnos' && <TurnosConfig />}
      </div>
    </div>
  )
}
