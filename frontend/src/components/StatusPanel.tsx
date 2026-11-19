import clsx from 'clsx'
import { CircleAlert, CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'
import { CONCURRENCY } from '../lib/constants'
import { formatBytes, formatSaving } from '../lib/format'
import type { Batch } from '../state/useBatch'

export function StatusPanel({ batch }: { batch: Batch }) {
  const { t } = useI18n()
  const { phase, stats, assets, originalTotal, outputTotal, retryFailed, process, globalError } = batch

  if (phase === 'uploading') {
    const pct = Math.round(assets.reduce((n, a) => n + a.uploadProgress, 0) / Math.max(1, assets.length))
    const done = assets.filter((a) => a.uploadProgress >= 100).length
    return (
      <div className="rounded-xl border border-outline-variant/60 bg-surface p-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wide text-white">{t('status.uploading')}</span>
          <span className="font-mono text-on-surface-variant">{t('status.uploadCount', { done, total: assets.length, pct })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-label={t('status.uploadProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-xl border border-error/50 bg-error-container/40 p-4">
        <CircleAlert className="h-5 w-5 shrink-0 text-error" aria-hidden />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{t('status.failedTitle')}</div>
          <div className="text-xs text-on-surface-variant">{globalError}</div>
        </div>
        <button type="button" className="btn-ghost !border-error/40 !text-error" onClick={process}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t('status.tryAgain')}
        </button>
      </div>
    )
  }

  if (phase !== 'processing' && phase !== 'completed' && phase !== 'partial') return null

  const total = Math.max(1, stats.total)
  const finished = stats.completed + stats.failed
  const pct = Math.round((finished / total) * 100)
  const saving = formatSaving(originalTotal, outputTotal)
  const w = (n: number) => `${(n / total) * 100}%`
  const tone = phase === 'completed' ? 'border-secondary/40 bg-secondary/5' : phase === 'partial' ? 'border-tertiary/40 bg-tertiary/5' : 'border-outline-variant/60 bg-surface'
  const slots = Array.from({ length: CONCURRENCY }, (_, i) => assets.find((a) => a.slot === i + 1))

  return (
    <section aria-label={t('status.section')} className={clsx('flex flex-col gap-3 rounded-xl border p-4 shadow-sm', tone)} role={phase === 'partial' ? 'alert' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          {phase === 'completed' && <CircleCheck className="h-4 w-4 text-secondary" aria-hidden />}
          {phase === 'partial' && <TriangleAlert className="h-4 w-4 text-tertiary" aria-hidden />}
          {phase === 'processing' && (
            <>
              <span className="font-semibold uppercase tracking-wide text-white">{t('status.pipeline')}</span>
              <span className="font-mono text-primary">{t('status.pctComplete', { pct })}</span>
              <span className="text-muted">{t('status.ofFiles', { done: finished, total: stats.total })}</span>
            </>
          )}
          {phase === 'completed' && (
            <>
              <span className="text-sm font-semibold text-white">{t('status.allProcessed', { n: stats.completed })}</span>
              <span className="font-mono text-on-surface-variant">{formatBytes(originalTotal)} → {formatBytes(outputTotal)} · <span className={saving.smaller ? 'text-secondary' : 'text-tertiary'}>{saving.text}</span></span>
            </>
          )}
          {phase === 'partial' && (
            <>
              <span className="text-sm font-semibold text-white">{t('status.partialTitle', { ok: stats.completed, failed: stats.failed })}</span>
              <span className="text-on-surface-variant">{t('status.partialHint')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="rounded border border-secondary/30 bg-secondary/15 px-2 py-0.5 font-medium text-secondary">{t('status.completedChip', { n: stats.completed })}</span>
          {phase === 'processing' && (
            <span className="flex items-center gap-1 rounded border border-primary/30 bg-primary/15 px-2 py-0.5 text-primary">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" aria-hidden /> {t('status.processingChip', { n: stats.processing })}
            </span>
          )}
          {stats.queued > 0 && <span className="rounded bg-surface-container px-2 py-0.5 text-muted">{t('status.queuedChip', { n: stats.queued })}</span>}
          {stats.failed > 0 && (
            <span className="flex items-center gap-1 rounded border border-error/30 bg-error/15 px-2 py-0.5 font-medium text-error">
              {t('status.failedChip', { n: stats.failed })}
              {phase !== 'processing' && (
                <button type="button" onClick={retryFailed} className="ml-1 text-[11px] underline hover:text-white">{t('status.retry')}</button>
              )}
            </span>
          )}
        </div>
      </div>

      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-high p-0.5"
        role="progressbar" aria-label={t('status.overall')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-secondary transition-all duration-300" style={{ width: w(stats.completed) }} />
        <div className="stripe h-full animate-stripe rounded-full bg-primary transition-all duration-300" style={{ width: w(stats.processing) }} />
        <div className="h-full rounded-full bg-error transition-all duration-300" style={{ width: w(stats.failed) }} />
      </div>

      {phase === 'processing' && (
        <div className="grid grid-cols-1 gap-2 border-t border-outline-variant/40 pt-3 font-mono text-[11px] text-on-surface-variant sm:grid-cols-3">
          {slots.map((a, i) => (
            <div key={i} className={clsx('flex items-center justify-between gap-2 rounded bg-surface-container-low px-2.5 py-1', a && 'border-l-2 border-primary')}>
              <span className={clsx('truncate', a && 'text-white')}>{a ? t('status.slotWith', { n: i + 1, name: a.name }) : t('status.slot', { n: i + 1 })}</span>
              <span className={a ? 'text-primary' : 'text-muted'}>{a ? t('status.processing') : t('status.idle')}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
