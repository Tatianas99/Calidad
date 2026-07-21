import { enqueue, processQueue } from './queue'
import { getToken, triggerUnauthorized, type Usuario } from './auth'

const API: string = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000'

export function apiBaseUrl() {
  return API
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) }
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

export async function login(username: string, password: string): Promise<{ token: string; usuario: Usuario }> {
  const res = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos')
  if (!res.ok) throw new Error('No se pudo iniciar sesión')
  return res.json()
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(API + path, { headers: authHeaders() })
  if (res.status === 401) { triggerUnauthorized(); throw new Error('No autenticado') }
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json() as Promise<T>
}

export type MutateResult<T> =
  | { ok: true; data: T }
  | { ok: false; queued: true }

export async function apiMutate<T>(
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<MutateResult<T>> {
  try {
    const res = await fetch(API + path, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return { ok: true, data: (await res.json()) as T }
    if (res.status === 401) { triggerUnauthorized(); throw new Error('No autenticado') }
    if (res.status === 404 || res.status >= 500) {
      enqueue({ method, path, body })
      return { ok: false, queued: true }
    }
    const detail = await res.text()
    throw new Error(`${method} ${path} -> ${res.status}: ${detail}`)
  } catch (e) {
    if (e instanceof TypeError) {
      enqueue({ method, path, body })
      return { ok: false, queued: true }
    }
    throw e
  }
}

// Petición que NO se encola (para acciones administrativas: usuarios, etc.).
export async function apiSend<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) { triggerUnauthorized(); throw new Error('No autenticado') }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* ignore */ }
    throw new Error(detail || `${method} ${path} -> ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function startSync() {
  const tick = () => processQueue(API)
  window.addEventListener('online', tick)
  window.setInterval(tick, 8000)
  tick()
}
