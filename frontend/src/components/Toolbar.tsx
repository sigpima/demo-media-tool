import { ImagePlus, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { extFor, formatBytes, labelFor } from '../lib/format'
import type { Phase, Settings } from '../types'

export function Toolbar({
  phase, count, totalBytes, settings, onBrowse, onClear,
}: { phase: Phase; count: number; totalBytes: number; settings: Settings; onBrowse: () => void; onClear: () => void }) {
  const { t } = useI18n()
  const busy = phase === 'processing' || phase === 'uploading'
  const target =
    settings.resizeMode === 'original'
      ? t('common.originalSize')
      : settings.resizeMode === 'width'
        ? t('toolbar.widthPx', { w: settings.width })
        : `${settings.width}×${settings.height}`
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/60 bg-surface/95 px-6 py-3.5 backdrop-blur-md">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight text-white">{t('toolbar.title')}</h1>
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">{t('toolbar.items', { count })}</span>
          {count > 0 && <span className="rounded-full bg-surface-container px-2 py-0.5 font-mono text-[11px] text-on-surface-variant">{t('toolbar.total', { size: formatBytes(totalBytes) })}</span>}
        </div>
        <span className="text-xs text-on-surface-variant">
          {t('toolbar.target')} <span className="font-mono">{labelFor(settings.format)}{settings.format !== 'png' && ` Q${settings.quality}`} · {target}</span>
          <span className="sr-only"> ({extFor(settings.format)})</span>
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <button type="button" className="btn-ghost" onClick={onClear} disabled={busy || count === 0}>
          <Trash2 className="h-4 w-4" aria-hidden /> {t('toolbar.clear')}
        </button>
        <button type="button" className="btn-ghost !text-white" onClick={onBrowse} disabled={busy}>
          <ImagePlus className="h-4 w-4 text-primary" aria-hidden /> {t('toolbar.import')}
        </button>
      </div>
    </div>
  )
}
