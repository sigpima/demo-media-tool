import clsx from 'clsx'
import { History, LayoutDashboard, Settings, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { FILE_TTL_HOURS } from '../lib/constants'

const ITEMS = [
  { label: 'Workspace', icon: LayoutDashboard, active: true },
  { label: 'Processing History', icon: History, soon: true },
  { label: 'Presets', icon: SlidersHorizontal, soon: true },
  { label: 'Settings', icon: Settings, soon: true },
]

/** Slim rail that expands over the content (no layout shift) on hover AND keyboard focus. */
export function Sidebar() {
  return (
    <div className="relative z-30 w-14 shrink-0">
      <aside className="group absolute inset-y-0 left-0 flex w-14 select-none flex-col justify-between overflow-hidden border-r border-outline-variant/60 bg-surface transition-[width] duration-200 hover:w-56 focus-within:w-56">
        <nav aria-label="Main" className="flex flex-col gap-1 p-2">
          {ITEMS.map(({ label, icon: Icon, active, soon }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              aria-disabled={soon || undefined}
              className={clsx(
                'flex items-center gap-3.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                active ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-white',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="flex flex-1 items-center justify-between whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {label}
                {soon && <span className="rounded border border-outline-variant/60 bg-surface-container px-1.5 py-0.5 text-[11px] text-muted">Soon</span>}
              </span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-outline-variant/60 p-2 text-[11px] text-muted" title={`Uploaded files are deleted automatically after ${FILE_TTL_HOURS} hours`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-secondary" aria-hidden />
          </span>
          <span className="whitespace-nowrap leading-tight opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            Files are deleted
            <br />
            after {FILE_TTL_HOURS} hours
          </span>
        </div>
      </aside>
    </div>
  )
}
