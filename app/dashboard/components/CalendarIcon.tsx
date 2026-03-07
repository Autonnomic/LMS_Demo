'use client'

/**
 * Calendar icon shaped like a calendar sheet: top bar with two rings,
 * rounded body, and the current day of the month displayed in the center.
 */
export default function CalendarIcon({
  size = 24,
  className,
  ariaHidden,
}: {
  size?: number
  className?: string
  ariaHidden?: boolean
}) {
  const currentDate = new Date().getDate()

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      {/* Top binding bar (extends slightly past body) */}
      <rect x={2.5} y={3} width={19} height={4} rx={0.5} fill="currentColor" stroke="none" />
      {/* Two hanger rings */}
      <circle cx={7} cy={2} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={17} cy={2} r={1.2} fill="currentColor" stroke="none" />
      {/* Calendar body (rounded corners) */}
      <rect
        x={3}
        y={6}
        width={18}
        height={15}
        rx={2}
        fill="none"
        stroke="currentColor"
      />
      {/* Current date number */}
      <text
        x={12}
        y={15.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        {currentDate}
      </text>
    </svg>
  )
}
