import type { ReactNode } from 'react'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>
        {label} {hint && <span className="hint">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}
