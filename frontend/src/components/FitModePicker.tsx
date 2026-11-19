import clsx from 'clsx'
import { useId, useRef } from 'react'
import { useI18n } from '../i18n'
import type { ResizeMode } from '../types'

const MODES: ResizeMode[] = ['fit', 'cover', 'width', 'original']

/** 2x2 grid of tiles (illustration + name + one line) instead of a dropdown. Arrow keys are handled explicitly (like Segmented). */
export function FitModePicker({ value, onChange }: { value: ResizeMode; onChange: (v: ResizeMode) => void }) {
  const { t } = useI18n()
  const labelId = useId()
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  // Explicit arrow handling (same as Segmented): left/up = previous, right/down = next, wrapping around the 2x2 grid.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + MODES.length) % MODES.length
    onChange(MODES[next])
    inputs.current[next]?.focus()
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[11px] text-on-surface-variant">{t('fit.label')}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-1.5">
        {MODES.map((m, i) => (
          <label key={m} className="relative cursor-pointer">
            <input
              type="radio" name="fit-mode" value={m} checked={value === m}
              ref={(el) => (inputs.current[i] = el)} onChange={() => onChange(m)} onKeyDown={(e) => onKey(e, i)} className="peer sr-only"
            />
            <span
              className={clsx(
                'flex h-full flex-col items-center gap-1 rounded-lg border p-2 text-center transition-all',
                'border-outline-variant/50 bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
                'peer-checked:border-primary/70 peer-checked:bg-surface-container-highest peer-checked:text-primary peer-checked:shadow-glow-sm',
                'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
              )}
            >
              <FitIcon mode={m} />
              <span className={clsx('text-xs font-medium', value === m ? 'text-primary' : 'text-white')}>{t(`fit.${m}.title`)}</span>
              <span className="text-[11px] leading-tight text-muted">{t(`fit.${m}.sub`)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted">{t(`fit.${value}.help`)}</p>
    </div>
  )
}

/** What the mode does to the picture, drawn with the target frame dashed and the image solid. */
function FitIcon({ mode }: { mode: ResizeMode }) {
  const frame = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeDasharray: '3 2.5', opacity: 0.8 }
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16" aria-hidden focusable="false">
      {mode === 'fit' && (
        <>
          <rect x="14" y="3" width="36" height="34" rx="2" {...frame} />
          <rect x="19" y="10" width="26" height="20" rx="1.5" fill="currentColor" opacity="0.85" />
        </>
      )}
      {mode === 'cover' && (
        <>
          <rect x="6" y="1" width="52" height="38" rx="2" fill="currentColor" opacity="0.18" />
          <rect x="14" y="6" width="36" height="28" rx="1.5" fill="currentColor" opacity="0.85" />
          <rect x="14" y="6" width="36" height="28" rx="2" {...frame} opacity="1" />
        </>
      )}
      {mode === 'width' && (
        <>
          <rect x="3" y="9" width="36" height="22" rx="1.5" fill="currentColor" opacity="0.85" />
          <path d="M3 5h36M3 3v4M39 3v4" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M43 9v22M41 9h4M41 31h4" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" fill="none" opacity="0.7" />
          <text x="47" y="22.5" fontSize="6.5" fill="currentColor" opacity="0.9" fontFamily="ui-monospace, monospace">auto</text>
        </>
      )}
      {mode === 'original' && (
        <>
          <rect x="14" y="6" width="36" height="28" rx="1.5" fill="currentColor" opacity="0.85" />
          <text x="32" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0c0e12" fontFamily="ui-monospace, monospace">1:1</text>
        </>
      )}
    </svg>
  )
}
