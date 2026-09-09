import { useEffect, useRef, useState } from 'react'
import { getBorrador, putBorrador } from './api'

const INTERVALO_SYNC = 10000 // cada 10 s revisa si otro dispositivo cambió algo

function leerLocal<T>(key: string, initial: T): T {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : initial
  } catch {
    return initial
  }
}

function escribirLocal<T>(key: string, valor: T) {
  try {
    localStorage.setItem(key, JSON.stringify(valor))
  } catch {
    /* almacenamiento lleno o no disponible: ignorar */
  }
}

// Persiste el estado de un formulario (la "lista del turno") en dos capas:
//   - localStorage: respaldo inmediato del propio dispositivo (y modo offline).
//   - servidor, asociado al usuario en sesión: permite continuar el MISMO turno
//     desde cualquier dispositivo con la misma cuenta. Es privado — otras
//     cuentas no ven ni modifican este borrador.
//
// Sincronización:
//   - Al abrir: trae el borrador del servidor (si existe lo adopta; si no, sube
//     lo local).
//   - Cada cambio: guarda local y sube al servidor con un pequeño retardo.
//   - Cada 10 s y al volver a la pestaña: trae los cambios hechos en OTRO
//     dispositivo. Solo los adopta si aquí no hay cambios locales sin subir, para
//     no pisar lo que se está capturando en este equipo.
export function useDraft<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => leerLocal(key, initial))
  const cargadoRef = useRef(false)        // ¿ya se leyó el borrador del servidor?
  const omitirGuardado = useRef(false)    // no reescribir lo que acabamos de leer
  const ultimoSync = useRef<string | null>(null) // JSON que coincide con el servidor
  const stateRef = useRef(state)
  stateRef.current = state

  // Adopta un valor venido del servidor sin re-disparar un guardado (evita eco).
  const adoptar = (remoto: T) => {
    omitirGuardado.current = true
    ultimoSync.current = JSON.stringify(remoto)
    escribirLocal(key, remoto)
    setState(remoto)
  }

  // Carga inicial del borrador remoto.
  useEffect(() => {
    let cancelado = false
    getBorrador<T>(key)
      .then((remoto) => {
        if (cancelado) return
        if (remoto != null) {
          adoptar(remoto) // el servidor manda: continuar el turno aquí
        } else {
          // Aún no hay borrador remoto: subir lo local si hay algo capturado.
          const local = leerLocal(key, initial)
          if (JSON.stringify(local) !== JSON.stringify(initial)) {
            putBorrador(key, local)
            ultimoSync.current = JSON.stringify(local)
          }
        }
      })
      .catch(() => {
        /* sin conexión o error: conservar lo local, no sobrescribir el remoto */
      })
      .finally(() => {
        if (!cancelado) cargadoRef.current = true
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Guardar cambios: local siempre; servidor con un pequeño retardo.
  useEffect(() => {
    escribirLocal(key, state)
    if (!cargadoRef.current) return
    if (omitirGuardado.current) {
      omitirGuardado.current = false
      return
    }
    const t = window.setTimeout(() => {
      putBorrador(key, state)
      ultimoSync.current = JSON.stringify(state)
    }, 700)
    return () => window.clearTimeout(t)
  }, [key, state])

  // Traer cambios hechos en otro dispositivo (periódico + al enfocar la pestaña).
  useEffect(() => {
    let cancelado = false
    const revisar = () => {
      if (!cargadoRef.current || document.hidden) return
      const actual = JSON.stringify(stateRef.current)
      // Si este equipo tiene cambios locales sin subir, no traer (no pisar).
      if (ultimoSync.current !== null && actual !== ultimoSync.current) return
      getBorrador<T>(key)
        .then((remoto) => {
          if (cancelado || remoto == null) return
          const actual2 = JSON.stringify(stateRef.current)
          const seguro = ultimoSync.current === null || actual2 === ultimoSync.current
          if (seguro && JSON.stringify(remoto) !== actual2) adoptar(remoto)
        })
        .catch(() => {})
    }
    const id = window.setInterval(revisar, INTERVALO_SYNC)
    window.addEventListener('focus', revisar)
    document.addEventListener('visibilitychange', revisar)
    return () => {
      cancelado = true
      window.clearInterval(id)
      window.removeEventListener('focus', revisar)
      document.removeEventListener('visibilitychange', revisar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const clear = () => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignorar */
    }
    ultimoSync.current = JSON.stringify(initial)
    putBorrador(key, initial)
  }

  return [state, setState, clear] as const
}
