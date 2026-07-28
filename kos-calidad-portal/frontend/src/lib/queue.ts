// Cola de mutaciones pendientes (resiliencia ante cortes de red).
// Guarda en localStorage y reintenta en orden FIFO cuando vuelve la conexión.
import { uuid } from './uuid'
import { getToken } from './auth'

export type QueuedRequest = {
  qid: string
  method: 'POST' | 'PUT' | 'PATCH'
  path: string
  body?: unknown
  createdAt: number
  attempts?: number
}

// Máximo de reintentos antes de descartar un envío que falla persistentemente
// (evita que un envío "envenenado" bloquee toda la cola para siempre).
const MAX_INTENTOS = 6

const KEY = 'kos_mutation_queue'
type Listener = (pending: number) => void
const listeners = new Set<Listener>()

function load(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as QueuedRequest[]
  } catch {
    return []
  }
}

function save(q: QueuedRequest[]) {
  localStorage.setItem(KEY, JSON.stringify(q))
  listeners.forEach((l) => l(q.length))
}

export function pendingCount(): number {
  return load().length
}

export function onPendingChange(l: Listener): () => void {
  listeners.add(l)
  l(load().length)
  return () => listeners.delete(l)
}

export function enqueue(req: Omit<QueuedRequest, 'qid' | 'createdAt'>) {
  const q = load()
  q.push({ ...req, qid: uuid(), createdAt: Date.now() })
  save(q)
}

// Descarta todos los envíos pendientes (acción manual del usuario).
export function clearQueue() {
  save([])
}

let processing = false

export async function processQueue(apiBase: string) {
  if (processing) return
  processing = true
  try {
    while (true) {
      const q = load()
      if (q.length === 0) break
      const req = q[0]
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        const t = getToken()
        if (t) headers['Authorization'] = `Bearer ${t}`
        const res = await fetch(apiBase + req.path, {
          method: req.method,
          headers,
          body: req.body != null ? JSON.stringify(req.body) : undefined,
        })
        if (res.ok) {
          const q2 = load()
          q2.shift()
          save(q2)
          continue
        }
        // 401 = sesión no válida ahora -> reintentar tras re-login (no descarta)
        if (res.status === 401) break
        // 404 (dependencia no sincronizada) o 5xx (temporal) -> reintentar,
        // pero descartar si falla demasiadas veces (envío envenenado).
        if (res.status === 404 || res.status >= 500) {
          const q2 = load()
          if (q2[0] && q2[0].qid === req.qid) {
            q2[0].attempts = (q2[0].attempts || 0) + 1
            if (q2[0].attempts >= MAX_INTENTOS) {
              q2.shift()
              save(q2)
              continue
            }
            save(q2)
          }
          break
        }
        // Otro 4xx permanente (validación) -> descartar para no bloquear la cola
        const q2 = load()
        q2.shift()
        save(q2)
      } catch {
        // sin red -> reintentar luego
        break
      }
    }
  } finally {
    processing = false
  }
}
