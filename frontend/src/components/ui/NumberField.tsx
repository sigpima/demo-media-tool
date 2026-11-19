import { useEffect, useId, useState } from 'react'

/** Number input that lets the user clear/retype freely; only commits valid values. */
export function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 8000,
  suffix,
  disabled,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  suffix?: string
  disabled?: boolean
}) {
  const id = useId()
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  const invalid = text !== '' && (!/^\d+$/.test(text) || +text < min || +text > max)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] text-on-surface-variant">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={text}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => {
            setText(e.target.value)
            if (/^\d+$/.test(e.target.value) && +e.target.value >= min && +e.target.value <= max) onChange(+e.target.value)
          }}
          onBlur={() => setText(String(value))}
          className={`field pr-7 font-mono ${invalid ? '!border-error' : ''}`}
        />
        {suffix && <span className="pointer-events-none absolute right-2 font-mono text-[11px] text-muted">{suffix}</span>}
      </div>
      {invalid && (
        <span role="alert" className="text-[11px] text-error">
          {min}–{max}
        </span>
      )}
    </div>
  )
}
