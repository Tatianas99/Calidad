import { useState, type FormEvent } from 'react'
import { login } from '../lib/api'
import { saveSession } from '../lib/auth'
import { Field } from './Field'

// Vaso de línea (silueta) reutilizado en el collage del fondo.
const Cup = () => (
  <g fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
    <ellipse cx={32} cy={10} rx={23} ry={6} />
    <path d="M9 11 L18 80 a5 5 0 0 0 5 4 h18 a5 5 0 0 0 5 -4 L55 11" />
    <path d="M14 40 q18 6 36 0" opacity={0.55} />
  </g>
)

export default function Login({ onLogged }: { onLogged: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await login(username.trim(), password)
      saveSession(r.token, r.usuario)
      onLogged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      {/* Collage de vasos de fondo (semitransparente). */}
      <svg className="login-bg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="cupPat" width={220} height={260} patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
            <g transform="translate(4,16) rotate(-4)"><Cup /></g>
            <g transform="translate(122,66) scale(0.82) rotate(12)"><Cup /></g>
            <g transform="translate(58,150) scale(0.92) rotate(-10)"><Cup /></g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cupPat)" />
      </svg>

      <div className="login-stack">
        <div className="login-hero">
          <img src="/logo-kos.png" alt="KOS Colombia" className="login-hero-logo" />
          <div className="login-hero-name">KOS COLOMBIA</div>
          <div className="login-hero-tag">Sistema de Gestión de Calidad</div>
        </div>

        <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/logo-kos.png" alt="KOS Colombia" className="login-logo" />
          <div>
            <h1>Portal de Calidad</h1>
            <div className="login-sub">KOS COLOMBIA</div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Ingresa con tu usuario y contraseña.</p>
        <Field label="Usuario">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </Field>
        <Field label="Contraseña">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <p className="tag-bad">{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !username || !password}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
        </form>
      </div>
    </div>
  )
}
