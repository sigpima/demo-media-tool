import clsx from 'clsx'
import { useRef } from 'react'

interface Option<T extends string> {
  value: T
  label: string
}

/** Radio group rendered as pills. Arrow keys move the selection (WAI-ARIA radio pattern). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T
  onChange: (v: T) => void
  options: Option<T>[]
  label: string
  disabled?: boolean
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-lg border border-outline-variant/50 bg-surface-container p-0.5 text-center font-mono text-[11px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              'rounded py-1.5 transition-colors',
              active ? 'bg-primary font-semibold text-black shadow-sm' : 'text-on-surface-variant hover:text-white',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
