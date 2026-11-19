import clsx from 'clsx'
import { Check, Columns2, Download, LoaderCircle, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { formatBytes, formatDims, formatSaving, labelFor } from '../lib/format'
import { outputSize } from '../lib/geometry'
import type { Asset, Phase, Settings } from '../types'

interface Props {
  asset: Asset
  phase: Phase
  settings: Settings
  inspecting: boolean
  onToggle: () => void
  onRemove: () => void
  onRetry: () => void
  onCompare: () => void
  onDownload: () => void
}

const SRC_LABEL = { jpeg: 'JPG', png: 'PNG', webp: 'WEBP' } as const

export function AssetCard({ asset: a, phase, settings, inspecting, onToggle, onRemove, onRetry, onCompare, onDownload }: Props) {
  const busy = phase === 'processing' || phase === 'uploading'
  const uploading = phase === 'uploading' && a.uploadProgress < 100
  const done = a.status === 'completed'
  const failed = a.status === 'failed'
  const working = a.status === 'processing'
  const queued = a.status === 'pending' && a.inBatch && phase === 'processing'
  const [tw, th] = outputSize(a.width, a.height, settings)
  const target = `${labelFor(settings.format)}${settings.format === 'png' ? '' : ` Q${settings.quality}`}`

  return (
    <li
      className={clsx(
        'group relative flex flex-col gap-2.5 rounded-xl border bg-surface p-3 shadow-sm transition-all',
        working && 'border-primary/70 shadow-glow',
        failed && 'border-error/50',
        inspecting && 'border-primary/70 shadow-glow-sm',
        !working && !failed && !inspecting && (a.selected ? 'border-outline-variant/60 hover:border-primary/50' : 'border-outline-variant/40 opacity-70 hover:opacity-100'),
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-container-low">
        <img
          src={a.previewUrl} alt="" loading="lazy" decoding="async"
          className={clsx('h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]', failed && 'opacity-50 grayscale', uploading && 'opacity-40')}
        />

        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <input
            type="checkbox" checked={a.selected} onChange={onToggle} disabled={busy}
            aria-label={`Select ${a.name}`} className="h-3.5 w-3.5 rounded accent-primary"
          />
          <span className="tag">{SRC_LABEL[a.format]}</span>
        </div>

        <div className="absolute right-2 top-2 flex items-center gap-1">
          {done && a.outSize != null && (() => {
            const saving = formatSaving(a.size, a.outSize)
            return (
              <span className={clsx('flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold text-black backdrop-blur', saving.smaller ? 'bg-secondary/90' : 'bg-tertiary/90')}>
                {saving.smaller && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                {saving.text}
                <span className="sr-only">{saving.smaller ? ' smaller' : ' larger than the original'}</span>
              </span>
            )
          })()}
          {queued && <span className="rounded border border-outline-variant bg-surface-container px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant">Queued</span>}
        </div>

        {!uploading && <span className="tag absolute bottom-2 left-2">{formatDims(a.width, a.height)}</span>}

        {uploading && (
          <div className="absolute inset-x-4 bottom-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-label={`Uploading ${a.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.uploadProgress}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${a.uploadProgress}%` }} />
            </div>
          </div>
        )}
        {working && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/20 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-surface/90 px-3 py-1.5 shadow-lg">
              <LoaderCircle className="h-[18px] w-[18px] animate-spin text-primary" aria-hidden />
              <span className="font-mono text-xs font-medium text-white">Processing</span>
            </div>
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-error/15 p-2 text-center">
            <TriangleAlert className="h-[22px] w-[22px] text-error" aria-hidden />
            <span className="mt-0.5 font-mono text-[11px] font-medium text-error">Failed</span>
          </div>
        )}
      </div>

      <div className="flex min-h-[2.5rem] flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-white" title={a.name}>{a.name}</span>
          <span className={clsx('shrink-0 font-mono text-[11px] font-semibold', done ? 'text-secondary' : failed ? 'text-error' : working ? 'text-primary' : 'text-on-surface-variant')}>
            {done && a.outSize != null ? formatBytes(a.outSize) : failed ? 'Failed' : formatBytes(a.size)}
          </span>
        </div>
        {working ? (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-container-high" aria-hidden>
            <div className="h-full w-2/5 animate-indeterminate rounded-full bg-primary" />
          </div>
        ) : failed ? (
          <span className="line-clamp-2 font-mono text-[11px] text-error" title={a.error}>{a.error}</span>
        ) : done ? (
          <div className="flex items-center justify-between font-mono text-[11px] text-muted">
            <span>Orig: {formatBytes(a.size)}</span>
            <span className="text-on-surface-variant">{labelFor(a.outFormat ?? settings.format)}{a.outQuality ? ` Q${a.outQuality}` : ''}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between font-mono text-[11px] text-muted">
            <span>→ {formatDims(tw, th)}</span>
            <span className="text-on-surface-variant">{target}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-outline-variant/40 pt-1.5">
        {done ? (
          <button type="button" onClick={onCompare} className="flex items-center gap-1 text-[11px] text-primary hover:underline" aria-label={`Compare ${a.name} before and after`}>
            <Columns2 className="h-3.5 w-3.5" aria-hidden /> Compare
          </button>
        ) : failed ? (
          <button type="button" onClick={onRetry} disabled={busy} className="flex items-center gap-1 rounded bg-error/20 px-2 py-0.5 text-[11px] font-medium text-error transition-colors hover:bg-error/30 disabled:opacity-45">
            <RefreshCw className="h-3 w-3" aria-hidden /> Retry
          </button>
        ) : (
          <span className="font-mono text-[11px] text-muted">{working ? `Slot #${a.slot}` : queued ? 'In queue' : uploading ? 'Uploading…' : 'Ready'}</span>
        )}
        <div className="flex items-center gap-1">
          {done && (
            <button type="button" onClick={onDownload} aria-label={`Download ${a.outName ?? a.name}`} title="Download" className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-white">
              <Download className="h-[15px] w-[15px]" aria-hidden />
            </button>
          )}
          <button type="button" onClick={onRemove} disabled={busy} aria-label={`Remove ${a.name}`} title="Remove" className="rounded p-1 text-muted hover:bg-surface-container hover:text-error disabled:opacity-40">
            <X className="h-[15px] w-[15px]" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  )
}
