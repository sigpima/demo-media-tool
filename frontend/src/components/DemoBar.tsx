import clsx from 'clsx'
import type { Phase } from '../types'

const STATES: Array<[Phase, string]> = [
  ['empty', 'Empty'], ['uploading', 'Uploading'], ['ready', 'Ready'], ['processing', 'Processing'],
  ['completed', 'Completed'], ['partial', 'Partial failure'], ['failed', 'Failed'],
]

/** Development helper to preview every UI state. Hidden in production builds (unless ?demo). */
export function DemoBar({ phase, onPick }: { phase: Phase; onPick: (p: Phase) => void }) {
  return (
    <div role="toolbar" aria-label="Demo state switcher" className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-high/95 px-2 py-1.5 text-xs shadow-2xl backdrop-blur">
      <span className="mr-1 border-r border-outline-variant pr-2 font-mono text-[11px] text-muted">demo state</span>
      {STATES.map(([id, label]) => (
        <button
          key={id} type="button" aria-pressed={phase === id} onClick={() => onPick(id)}
          className={clsx('rounded-md px-2.5 py-1 transition-colors', phase === id ? 'bg-primary font-semibold text-black' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-white')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
