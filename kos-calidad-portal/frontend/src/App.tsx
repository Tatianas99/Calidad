import { useEffect, useState } from 'react'
import { startSync } from './lib/api'
import { getUser, logout, setOnUnauthorized, hasPermiso, type Usuario } from './lib/auth'
import SyncBadge from './components/SyncBadge'
import Login from './components/Login'
import F005Form from './forms/F005Rollos/F005Form'
import F006Form from './forms/F006Vasos/F006Form'
import F015Form from './forms/F015Agua/F015Form'
import F158Form from './forms/F158Rutas/F158Form'
import F204Form from './forms/F204Entrega/F204Form'
import RegistrosF006 from './views/RegistrosF006'
import RegistrosF015 from './views/RegistrosF015'
import RegistrosF158 from './views/RegistrosF158'
import RegistrosF204 from './views/RegistrosF204'
import RegistrosF005 from './views/RegistrosF005'
import Configuracion from './views/Configuracion'
import Dashboard from './views/Dashboard'
import { CupsIcon, WaterTestIcon, BadgeIcon, TrashIcon, RollIcon } from './components/FormIcons'

type View = 'home' | 'dashboard' | 'f005' | 'f006' | 'f015' | 'f158' | 'f204' | 'reportes' | 'reg005' | 'reg006' | 'reg015' | 'reg158' | 'reg204' | 'config'

export default function App() {
  const [user, setUser] = useState<Usuario | null>(getUser())
  const [view, setView] = useState<View>('home')
  // En móvil el menú arranca contraído (ocupa mucho espacio); en escritorio abierto.
  const [navOpen, setNavOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 820 : true))
  // Navegar y, en móvil, cerrar el menú para dejar ver el contenido.
  const irA = (v: View) => { setView(v); if (typeof window !== 'undefined' && window.innerWidth <= 820) setNavOpen(false) }
  const [f005Edit, setF005Edit] = useState<string | null>(null)
  const [f006Edit, setF006Edit] = useState<string | null>(null)
  const [f015Edit, setF015Edit] = useState<string | null>(null)
  const [f158Edit, setF158Edit] = useState<string | null>(null)
  const [f204Edit, setF204Edit] = useState<string | null>(null)

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
      <button className="nav-brand" onClick={() => irA('home')} title="Ir al inicio">
        <img src="/logo-kos.png" alt="KOS Colombia" className="nav-logo" />
        <span className="nav-brand-txt">
          <span className="nav-brand-title">PORTAL CALIDAD</span>
          <span className="nav-brand-sub">KOS COLOMBIA</span>
        </span>
      </button>

      <NavItem label="Inicio" active={view === 'home'} onClick={() => irA('home')} />
      {hasPermiso('ver_registros') && <NavItem label="📊 Dashboard" active={view === 'dashboard'} onClick={() => irA('dashboard')} />}

      {(hasPermiso('registrar_f005') || hasPermiso('registrar_f006') || hasPermiso('registrar_f015') || hasPermiso('registrar_f158') || hasPermiso('registrar_f204')) && <div className="nav-sec">Registrar</div>}
      {hasPermiso('registrar_f005') && <NavItem label="F-005 Liberación de rollos" active={view === 'f005'} onClick={() => irA('f005')} />}
      {hasPermiso('registrar_f006') && <NavItem label="F-006 Pruebas filtración" active={view === 'f006'} onClick={() => irA('f006')} />}
      {hasPermiso('registrar_f015') && <NavItem label="F-015 Cloro/PH" active={view === 'f015'} onClick={() => irA('f015')} />}
      {hasPermiso('registrar_f158') && <NavItem label="F-158 Rutas Calidad" active={view === 'f158'} onClick={() => irA('f158')} />}
      {hasPermiso('registrar_f204') && <NavItem label="F-204 Clase B y desperdicio" active={view === 'f204'} onClick={() => irA('f204')} />}

      {hasPermiso('ver_registros') && <div className="nav-sec">Consultar</div>}
      {hasPermiso('ver_registros') && <NavItem label="Ver reportes" active={['reportes', 'reg005', 'reg006', 'reg015', 'reg158', 'reg204'].includes(view)} onClick={() => irA('reportes')} />}

      {(hasPermiso('gestionar_usuarios') || hasPermiso('gestionar_catalogos')) && <div className="nav-sec">Administración</div>}
      {(hasPermiso('gestionar_usuarios') || hasPermiso('gestionar_catalogos')) && <NavItem label="Configuraciones" active={view === 'config'} onClick={() => irA('config')} />}

      <div className="nav-foot">
        <div className="nav-user">👤 {user.nombre}<span className="muted"> · {user.rol}</span></div>
        <button className="btn btn-ghost nav-logout" onClick={cerrarSesion}>Cerrar sesión</button>
      </div>
    </nav>
  )

  return (
    <div className="app">
      <header className="topbar">
        <button className="navtoggle" onClick={() => setNavOpen((o) => !o)} aria-label="Menú" title="Mostrar/ocultar menú">☰</button>
        <button className="brand" onClick={() => setView('home')}>Calidad · KOS Colombia</button>
        <SyncBadge />
      </header>
      <div className={'dash-body' + (navOpen ? '' : ' nav-hidden')}>
        {navOpen && nav}
        <main className="dash-main">
          {view === 'home' && <Home onOpen={setView} />}
          {view === 'dashboard' && <Dashboard />}
          {view === 'reportes' && <Reportes onOpen={setView} />}
          {view === 'f005' && <F005Form onExit={() => setView('home')} editarId={f005Edit} onEditarConsumido={() => setF005Edit(null)} />}
          {view === 'f006' && <F006Form onExit={() => setView('home')} editarId={f006Edit} onEditarConsumido={() => setF006Edit(null)} />}
          {view === 'f015' && <F015Form onExit={() => setView('home')} editarId={f015Edit} onEditarConsumido={() => setF015Edit(null)} />}
          {view === 'f158' && <F158Form onExit={() => setView('home')} editarId={f158Edit} onEditarConsumido={() => setF158Edit(null)} />}
          {view === 'f204' && <F204Form onExit={() => setView('home')} editarId={f204Edit} onEditarConsumido={() => setF204Edit(null)} />}
          {view === 'reg005' && <RegistrosF005 onBack={() => setView('reportes')} onEditar={(id) => { setF005Edit(id); setView('f005') }} />}
          {view === 'reg006' && <RegistrosF006 onBack={() => setView('reportes')} onEditar={(id) => { setF006Edit(id); setView('f006') }} />}
          {view === 'reg015' && <RegistrosF015 onBack={() => setView('reportes')} onEditar={(id) => { setF015Edit(id); setView('f015') }} />}
          {view === 'reg158' && <RegistrosF158 onBack={() => setView('reportes')} onEditar={(id) => { setF158Edit(id); setView('f158') }} />}
          {view === 'reg204' && <RegistrosF204 onBack={() => setView('reportes')} onEditar={(id) => { setF204Edit(id); setView('f204') }} />}
          {view === 'config' && <Configuracion />}
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

function Reportes({ onOpen }: { onOpen: (v: View) => void }) {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Ver reportes</h1>
      <p className="muted">Selecciona el reporte que quieres consultar.</p>
      <div className="home-grid compact">
        <button className="card tint blue-2" onClick={() => onOpen('reg005')}>
          <RollIcon className="card-icon" />
          <div className="code">F-005</div><h2>Liberación de rollos</h2>
        </button>
        <button className="card tint blue-1" onClick={() => onOpen('reg006')}>
          <CupsIcon className="card-icon" />
          <div className="code">F-006</div><h2>Pruebas filtración</h2>
        </button>
        <button className="card tint blue-2" onClick={() => onOpen('reg015')}>
          <WaterTestIcon className="card-icon" />
          <div className="code">F-015</div><h2>Cloro / PH</h2>
        </button>
        <button className="card tint blue-3" onClick={() => onOpen('reg158')}>
          <BadgeIcon className="card-icon" />
          <div className="code">F-158</div><h2>Rutas Calidad</h2>
        </button>
        <button className="card tint blue-1" onClick={() => onOpen('reg204')}>
          <TrashIcon className="card-icon" />
          <div className="code">F-204</div><h2>Clase B y desperdicio</h2>
        </button>
      </div>
    </div>
  )
}

function Home({ onOpen }: { onOpen: (v: View) => void }) {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Portal de Calidad</h1>
      <p className="muted">Selecciona una opción del menú o una tarjeta.</p>
      <div style={{ marginBottom: 18 }}>
        <a className="btn btn-primary" href="https://pqrs.kosxpress.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          📋 Ir al portal de PQRS ↗
        </a>
      </div>
      <div className="home-grid">
        {hasPermiso('registrar_f005') && (
          <button className="card tint blue-2" onClick={() => onOpen('f005')}>
            <RollIcon className="card-icon" />
            <div className="code">F-005</div><h2>Liberación de rollos</h2>
            <p>Lote, material, calibre, estado y liberación.</p>
          </button>
        )}
        {hasPermiso('registrar_f006') && (
          <button className="card tint blue-1" onClick={() => onOpen('f006')}>
            <CupsIcon className="card-icon" />
            <div className="code">F-006</div><h2>Pruebas filtración</h2>
            <p>Producto, embalaje, pruebas de filtración y firmas.</p>
          </button>
        )}
        {hasPermiso('registrar_f015') && (
          <button className="card tint blue-2" onClick={() => onOpen('f015')}>
            <WaterTestIcon className="card-icon" />
            <div className="code">F-015</div><h2>Registrar cloro/PH</h2>
            <p>Medición diaria por turno con rangos.</p>
          </button>
        )}
        {hasPermiso('registrar_f158') && (
          <button className="card tint blue-3" onClick={() => onOpen('f158')}>
            <BadgeIcon className="card-icon" />
            <div className="code">F-158</div><h2>Rutas Calidad</h2>
            <p>Recorridos por proceso con checklist y evidencias.</p>
          </button>
        )}
        {hasPermiso('registrar_f204') && (
          <button className="card tint blue-1" onClick={() => onOpen('f204')}>
            <TrashIcon className="card-icon" />
            <div className="code">F-204</div><h2>Clase B y desperdicio</h2>
            <p>Registro por turno: máquina, referencia y responsables.</p>
          </button>
        )}
      </div>
    </div>
  )
}
