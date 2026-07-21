import type { Option } from '../lib/types'

// Grupo de botones de selección única (estilo formato en papel).
export default function OptionButtons({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="optbtns">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={'optbtn' + (value === o.value ? ' sel' : '')}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
