// Íconos de línea para las tarjetas de cada formato (usan currentColor, así que
// toman el color de acento de cada tarjeta). Recreados de los íconos aportados.
type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

// F-006 — vasos apilados (pruebas de filtración).
export function CupsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="6.8" y="2.6" width="10.4" height="2.2" rx="1.1" />
      <rect x="6.8" y="6.2" width="10.4" height="2.2" rx="1.1" />
      <rect x="6.3" y="9.8" width="11.4" height="2.2" rx="1.1" />
      <path d="M6.9 12 8.5 20.6a1.3 1.3 0 0 0 1.28 1.06h4.44a1.3 1.3 0 0 0 1.28-1.06L17.1 12" />
    </svg>
  )
}

// F-015 — gota de agua con lupa (cloro / PH).
export function WaterTestIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M14.9 14.9 20 20" />
      <path d="M10.5 6.8c1.9 2.4 2.9 3.9 2.9 5.1a2.9 2.9 0 0 1-5.8 0c0-1.2 1-2.7 2.9-5.1z" />
    </svg>
  )
}

// F-158 — medalla de calidad (rutas calidad).
export function BadgeIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="9" r="6" />
      <path d="M9.3 9 11 10.7 14.7 7" />
      <path d="M9.4 14.1 7.3 20.4l2.8-1.3 1.4 2.4" />
      <path d="M14.6 14.1 16.7 20.4l-2.8-1.3-1.4 2.4" />
    </svg>
  )
}

// F-005 — rollo de material (liberación de rollos).
export function RollIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <ellipse cx="7" cy="12" rx="3.4" ry="8.4" />
      <circle cx="7" cy="12" r="1.4" />
      <path d="M7 3.6h9.5a3.4 8.4 0 0 1 0 16.8H7" />
      <path d="M16.5 3.6a3.4 8.4 0 0 0 0 16.8" />
    </svg>
  )
}

// F-204 — caneca (clase B y desperdicio).
export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4.6 6.4h14.8" />
      <path d="M9.2 6.4V5a1.1 1.1 0 0 1 1.1-1.1h3.4A1.1 1.1 0 0 1 14.8 5v1.4" />
      <path d="M6.3 6.4 7.5 20a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5L17.7 6.4" />
      <path d="M10 10.2v7.2M14 10.2v7.2" />
    </svg>
  )
}
