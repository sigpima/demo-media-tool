import clsx from 'clsx'
import { Check, Images, SlidersHorizontal } from 'lucide-react'
import { useI18n, type Lang } from '../i18n'
import type { ApiConfig } from '../services/api'
import type { Phase } from '../types'
import { Segmented } from './ui/Segmented'

const STEPS = ['topbar.step.upload', 'topbar.step.configure', 'topbar.step.process'] as const
const stepIndex: Record<Phase, number> = { empty: 0, uploading: 0, ready: 1, failed: 1, processing: 2, completed: 2, partial: 2 }
const dot: Record<Phase, string> = {
  empty: 'bg-outline', uploading: 'bg-tertiary', ready: 'bg-primary', processing: 'bg-tertiary animate-pulse',
  completed: 'bg-secondary', partial: 'bg-tertiary', failed: 'bg-error',
}

export function TopBar({ phase, batchName, guest, onToggleRecipe, recipeOpen }: { phase: Phase; batchName: string; guest?: ApiConfig; onToggleRecipe: () => void; recipeOpen: boolean }) {
  const { t } = useI18n()
  const current = stepIndex[phase]
  const allDone = phase === 'completed'
  return (
    <header className="z-40 flex h-13 shrink-0 select-none items-center justify-between gap-4 border-b border-outline-variant/60 bg-surface px-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/20 text-primary shadow-[0_0_12px_rgba(129,140,248,0.25)]">
            <Images className="h-4 w-4" aria-hidden />
          </div>
          <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-white">Creative Batch Toolkit</span>
        </div>
        <div className="hidden h-4 w-px bg-outline-variant/70 sm:block" />
        {guest ? (
          <GuestChip guest={guest} />
        ) : (
          <div className="hidden min-w-0 items-center gap-2 text-xs text-on-surface-variant sm:flex">
            <span className="font-mono text-muted">{t('topbar.batch')}</span>
            <span className="truncate font-mono font-medium text-white">{batchName}</span>
            <span className={clsx('h-2 w-2 shrink-0 rounded-full', dot[phase])} aria-hidden />
          </div>
        )}
      </div>

      <ol aria-label={t('topbar.progress')} className="hidden items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-low px-2 py-1 md:flex">
        {STEPS.map((key, i) => {
          const done = i < current || (allDone && i === current)
          const active = i === current && !allDone
          return (
            <li key={key} className="flex items-center gap-1" aria-current={active ? 'step' : undefined}>
              {i > 0 && <span className="px-1 text-xs text-outline-variant" aria-hidden>/</span>}
              <span
                className={clsx(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs',
                  active ? 'border border-outline-variant/60 bg-surface-container-highest font-semibold text-white shadow-sm' : 'font-medium text-on-surface-variant',
                )}
              >
                <span
                  className={clsx(
                    'flex h-4 w-4 items-center justify-center rounded-full font-mono text-[11px]',
                    done ? 'bg-secondary text-black' : active ? 'bg-primary font-bold text-black' : 'bg-surface-container-highest text-muted',
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                {t(key)}
                <span className="sr-only">{done ? t('topbar.step.done') : active ? t('topbar.step.current') : ''}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onToggleRecipe} aria-expanded={recipeOpen} aria-controls="recipe-panel" className="btn-ghost desk:hidden">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {t('topbar.recipe')}
        </button>
        <LangSwitch />
      </div>
    </header>
  )
}

/** Shown to people who came in through an invite link: what is left of their trial. */
function GuestChip({ guest }: { guest: ApiConfig }) {
  const { t } = useI18n()
  const days = guest.inviteExpiresAt ? Math.max(0, Math.ceil((new Date(guest.inviteExpiresAt).getTime() - Date.now()) / 86_400_000)) : null
  return (
    <div className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary desk:flex" title={t('guest.title')}>
      <span className="font-semibold">{t('guest.label')}</span>
      {guest.imagesLeftToday != null && <span className="font-mono">{t('guest.imagesLeft', { n: guest.imagesLeftToday })}</span>}
      {days != null && <span className="font-mono">· {t('guest.days', { count: days })}</span>}
    </div>
  )
}

/** EN | VI switch. Each language is named in its own language, so it can be found whichever one is active. */
function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="w-[88px] shrink-0">
      <Segmented<Lang> label={t('lang.switch')} value={lang} onChange={setLang} options={[{ value: 'en', label: 'EN' }, { value: 'vi', label: 'VI' }]} />
    </div>
  )
}
