import { useEffect, useRef, useState } from 'react'
import { getBorrador, putBorrador } from './api'

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
// Al abrir el formulario se trae el borrador del servidor (si existe) y se
// adopta; si el servidor aún no tiene nada, se sube lo que haya localmente.
export function useDraft<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => leerLocal(key, initial))
  const cargadoRef = useRef(false)       // ¿ya se leyó el borrador del servidor?
  const omitirGuardado = useRef(false)   // no reescribir lo que acabamos de leer

  // Cargar el borrador remoto una vez al montar.
  useEffect(() => {
    let cancelado = false
    getBorrador<T>(key)
      .then((remoto) => {
        if (cancelado) return
        if (remoto != null) {
          // El servidor manda: adoptar su versión (continuar el turno aquí).
          omitirGuardado.current = true
          setState(remoto)
          escribirLocal(key, remoto)
        } else {
          // Aún no hay borrador remoto: subir lo local si hay algo capturado.
          const local = leerLocal(key, initial)
          if (JSON.stringify(local) !== JSON.stringify(initial)) putBorrador(key, local)
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

  // Cada cambio: guarda local siempre y, tras la carga inicial, sube al servidor
  // con un pequeño retardo (para no saturar mientras se escribe).
  useEffect(() => {
    escribirLocal(key, state)
    if (!cargadoRef.current) return
    if (omitirGuardado.current) {
      omitirGuardado.current = false
      return
    }
    const t = window.setTimeout(() => putBorrador(key, state), 700)
    return () => window.clearTimeout(t)
  }, [key, state])

  const clear = () => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignorar */
    }
    putBorrador(key, initial)
  }

  return [state, setState, clear] as const
}
