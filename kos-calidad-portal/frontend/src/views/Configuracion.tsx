import { useState } from 'react'
import { hasPermiso } from '../lib/auth'
import Usuarios from './Usuarios'
import CatalogoSimple from './CatalogoSimple'
import TurnosConfig from './TurnosConfig'

type Tab = 'usuarios' | 'proveedores' | 'puntos' | 'turnos'

// Cada pestaña exige un permiso. El rol "calidad" solo tiene gestionar_catalogos,
// así que solo ve Proveedores de papel y Puntos de medición.
const TABS: { key: Tab; label: string; icon: string; permiso: string }[] = [
  { key: 'usuarios', label: 'Usuarios', icon: '👤', permiso: 'gestionar_usuarios' },
  { key: 'proveedores', label: 'Proveedores papel', icon: '📄', permiso: 'gestionar_catalogos' },
  { key: 'puntos', label: 'Puntos de medición', icon: '📍', permiso: 'gestionar_catalogos' },
  { key: 'turnos', label: 'Turnos', icon: '🕐', permiso: 'gestionar_usuarios' },
]

export default function Configuracion() {
  const tabs = TABS.filter((t) => hasPermiso(t.permiso))
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'proveedores')

  return (
    <div>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Configuración</h1>
      <p className="muted" style={{ marginTop: 0 }}>{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      <div className="cfg-tabs">
        {tabs.map((t) => (
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
