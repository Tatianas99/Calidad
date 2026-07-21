export type Usuario = {
  id: number
  username: string
  nombre: string
  rol: string
  permisos: string[]
  activo: boolean
}

const TOKEN_KEY = 'kos_token'
const USER_KEY = 'kos_user'

let onUnauth: (() => void) | null = null
export function setOnUnauthorized(fn: () => void) { onUnauth = fn }

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): Usuario | null {
  try {
    const s = localStorage.getItem(USER_KEY)
    return s ? (JSON.parse(s) as Usuario) : null
  } catch {
    return null
  }
}

export function saveSession(token: string, usuario: Usuario) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(usuario))
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// Llamado cuando el backend responde 401: cerrar sesión y avisar a la app.
export function triggerUnauthorized() {
  logout()
  if (onUnauth) onUnauth()
}

export function hasPermiso(p: string): boolean {
  const u = getUser()
  return !!u && (u.rol === 'admin' || u.permisos.includes(p))
}
