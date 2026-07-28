import { useEffect, useState } from 'react'
import { onPendingChange, clearQueue } from '../lib/queue'

// Indicador visible del estado de conexión y de envíos pendientes de sincronizar.
export default function SyncBadge() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const unsub = onPendingChange(setPending)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      unsub()
    }
  }, [])

  return (
    <div className="sync">
      <span className={'dot' + (online ? '' : ' off')} />
      <span>{online ? 'En línea' : 'Sin conexión'}</span>
      {pending > 0 && (
        <>
          <span className="pill">{pending} por sincronizar</span>
          <button
            className="pill pill-btn"
            title="Descartar los envíos pendientes (no se enviarán al servidor)"
            onClick={() => {
              if (window.confirm(`¿Descartar ${pending} envío(s) pendiente(s)? No se enviarán al servidor y no podrán recuperarse.`)) clearQueue()
            }}
          >
            descartar
          </button>
        </>
      )}
    </div>
  )
}
