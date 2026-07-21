import { useEffect, useState } from 'react'
import { startSync } from './lib/api'
import { getUser, logout, setOnUnauthorized, hasPermiso, type Usuario } from './lib/auth'
import SyncBadge from './components/SyncBadge'
import Login from './components/Login'
import F006Form from './forms/F006Vasos/F006Form'
import F015Form from './forms/F015Agua/F015Form'
import RegistrosF006 from './views/RegistrosF006'
import RegistrosF015 from './views/RegistrosF015'
import Usuarios from './views/Usuarios'

type View = 'home' | 'f006' | 'f015' | 'reg006' | 'reg015' | 'usuarios'

export default function App() {
  const [user, setUser] = useState<Usuario | null>(getUser())
  const [view, setView] = useState<View>('home')

  useEffect(() => {
    setOnUnauthorized(() => setUser(null)) // 401 => volver al login
    startSync()
  }, [])

  if (!user) {
    return <Login onLogged={() => { setUser(getUser()); setView('home') }} />
  }

  const cerrarSesion = () => { logout(); setUser(null) }

  const nav = (
    <nav className="mainnav">
      <NavItem label="Inicio" active={view === 'home'} onClick={() => setView('home')} />

      {(hasPermiso('registrar_f006') || hasPermiso('registrar_f015')) && <div className="nav-sec">Registrar</div>}
      {hasPermiso('registrar_f006') && <NavItem label="F-006 Vasos" active={view === 'f006'} onClick={() => setView('f006')} />}
      {hasPermiso('registrar_f015') && <NavItem label="F-015 Cloro/PH" active={view === 'f015'} onClick={() => setView('f015')} />}

      {hasPermiso('ver_registros') && <div className="nav-sec">Consultar</div>}
      {hasPermiso('ver_registros') && <NavItem label="Ver registros F-006" active={view === 'reg006'} onClick={() => setView('reg006')} />}
      {hasPermiso('ver_registros') && <NavItem label="Ver registros F-015" active={view === 'reg015'} onClick={() => setView('reg015')} />}

      {hasPermiso('gestionar_usuarios') && <div className="nav-sec">Administración</div>}
      {hasPermiso('gestionar_usuarios') && <NavItem label="Usuarios" active={view === 'usuarios'} onClick={() => setView('usuarios')} />}

      <div className="nav-foot">
        <div className="nav-user">👤 {user.nombre}<span className="muted"> · {user.rol}</span></div>
        <button className="btn btn-ghost nav-logout" onClick={cerrarSesion}>Cerrar sesión</button>
      </div>
    </nav>
  )

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')}>Calidad · KOS Colombia</button>
        <SyncBadge />
      </header>
      <div className="dash-body">
        {nav}
        <main className="dash-main">
          {view === 'home' && <Home onOpen={setView} />}
          {view === 'f006' && <F006Form onExit={() => setView('home')} />}
          {view === 'f015' && <F015Form onExit={() => setView('home')} />}
          {view === 'reg006' && <RegistrosF006 />}
          {view === 'reg015' && <RegistrosF015 />}
          {view === 'usuarios' && <Usuarios />}
        </main>
      </div>
    </div>
  )
}

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={'nav-item' + (active ? ' active' : '')} onClick={onClick}>{label}</button>
  )
}

function Home({ onOpen }: { onOpen: (v: View) => void }) {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Portal de Calidad</h1>
      <p className="muted">Selecciona una opción del menú o una tarjeta.</p>
      <div className="home-grid">
        {hasPermiso('registrar_f006') && (
          <button className="card" onClick={() => onOpen('f006')}>
            <div className="code">F-006</div><h2>Registrar vasos</h2>
            <p>Embalaje, pruebas de filtración y firmas.</p>
          </button>
        )}
        {hasPermiso('registrar_f015') && (
          <button className="card" onClick={() => onOpen('f015')}>
            <div className="code">F-015</div><h2>Registrar cloro/PH</h2>
            <p>Medición diaria por turno con rangos.</p>
          </button>
        )}
        {hasPermiso('ver_registros') && (
          <button className="card" onClick={() => onOpen('reg006')}>
            <div className="code">📋</div><h2>Ver registros</h2>
            <p>Consulta y filtra los registros guardados.</p>
          </button>
        )}
        {hasPermiso('gestionar_usuarios') && (
          <button className="card" onClick={() => onOpen('usuarios')}>
            <div className="code">⚙</div><h2>Usuarios</h2>
            <p>Crear usuarios, roles y permisos.</p>
          </button>
        )}
      </div>
    </div>
  )
}
