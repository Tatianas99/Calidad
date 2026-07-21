import { useEffect, useState } from 'react'

// Persiste el estado de un formulario en localStorage (borrador local),
// para no perder lo capturado si se recarga o cierra la página.
export function useDraft<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      return s ? (JSON.parse(s) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* almacenamiento lleno o no disponible: ignorar */
    }
  }, [key, state])

  const clear = () => localStorage.removeItem(key)
  return [state, setState, clear] as const
}
