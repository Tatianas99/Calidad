import { useState, type FormEvent } from 'react'
import { login } from '../lib/api'
import { saveSession } from '../lib/auth'
import { Field } from './Field'

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
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="code">KOS</span>
          <h1>Portal de Calidad</h1>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Ingresa con tu usuario y contraseña.</p>
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
  )
}
