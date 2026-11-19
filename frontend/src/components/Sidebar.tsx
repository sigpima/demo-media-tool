import clsx from 'clsx'
import { LayoutDashboard, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useI18n } from '../i18n'
import { FILE_TTL_HOURS } from '../lib/constants'

/** Slim rail that expands over the content (no layout shift) on hover AND keyboard focus. */
export function Sidebar({ onOpenPresets }: { onOpenPresets: () => void }) {
  const { t } = useI18n()
  const item = 'flex items-center gap-3.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors'
  const label = 'whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
  return (
    <div className="relative z-30 w-14 shrink-0">
      <aside className="group absolute inset-y-0 left-0 flex w-14 select-none flex-col justify-between overflow-hidden border-r border-outline-variant/60 bg-surface transition-[width] duration-200 hover:w-56 focus-within:w-56">
        <nav aria-label={t('nav.main')} className="flex flex-col gap-1 p-2">
          <button type="button" aria-label={t('nav.workspace')} aria-current="page" className={clsx(item, 'bg-surface-container-highest text-primary')}>
            <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden />
            <span className={label}>{t('nav.workspace')}</span>
          </button>
          <button
            type="button" aria-label={t('nav.presets')} onClick={onOpenPresets}
            className={clsx(item, 'text-on-surface-variant hover:bg-surface-container-high hover:text-white')}
          >
            <SlidersHorizontal className="h-5 w-5 shrink-0" aria-hidden />
            <span className={label}>{t('nav.presets')}</span>
          </button>
        </nav>
        <div className="flex items-center gap-3 border-t border-outline-variant/60 p-2 text-[11px] text-muted" title={t('nav.ttlTitle', { h: FILE_TTL_HOURS })}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-secondary" aria-hidden />
          </span>
          <span className="whitespace-nowrap leading-tight opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {t('nav.ttl1')}
            <br />
            {t('nav.ttl2', { h: FILE_TTL_HOURS })}
          </span>
        </div>
      </aside>
    </div>
  )
}
