import type { MouseEvent } from 'react'

// Acciones de fila: lápiz verde (editar) y basurero rojo (borrar).
// Usa currentColor para que el color venga del CSS (.act-icon.edit / .act-icon.del).
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
)
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

export default function RowActions({
  onEdit, onDelete,
}: {
  onEdit?: () => void
  onDelete?: () => void
}) {
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn() }
  return (
    <div className="row-actions">
      {onEdit && (
        <button className="act-icon edit" title="Editar" onClick={stop(onEdit)}><PencilIcon /></button>
      )}
      {onDelete && (
        <button className="act-icon del" title="Borrar" onClick={stop(onDelete)}><TrashIcon /></button>
      )}
    </div>
  )
}
