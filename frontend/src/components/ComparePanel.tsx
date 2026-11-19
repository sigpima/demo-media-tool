import { ArrowLeftRight, Download } from 'lucide-react'
import { formatBytes, formatDims, formatSaving, labelFor } from '../lib/format'
import type { Batch } from '../state/useBatch'

/** Inline before/after panel. Only shows exact numbers that came from the encode. */
export function ComparePanel({ batch }: { batch: Batch }) {
  const a = batch.inspected
  if (!a || a.outSize == null) return null
  const saving = formatSaving(a.size, a.outSize)
  const fmt = (f: string) => labelFor(f)
  return (
    <section id="compare-panel" aria-label="Before and after" className="flex flex-col gap-4 rounded-xl border border-outline-variant/60 bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ArrowLeftRight className="h-[18px] w-[18px] text-primary" aria-hidden />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white">Before &amp; after</h2>
            <span className="font-mono text-xs text-on-surface-variant">Inspecting: {a.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={saving.smaller ? 'rounded-full border border-secondary/30 bg-secondary/15 px-2.5 py-1 font-mono text-xs font-medium text-secondary' : 'rounded-full border border-tertiary/30 bg-tertiary/15 px-2.5 py-1 font-mono text-xs font-medium text-tertiary'}>
            {saving.smaller ? `${saving.text} (−${formatBytes(a.size - a.outSize)})` : `${saving.text} larger than the original`}
          </span>
          <button type="button" className="btn-export" onClick={() => batch.download(a.id)}>
            <Download className="h-[15px] w-[15px]" aria-hidden /> Download
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <Pane title="Original" meta={`${formatBytes(a.size)} · ${fmt(a.format)}`} dims={formatDims(a.width, a.height)} src={a.previewUrl} alt={`Original ${a.name}`} />
        <Pane
          title="Optimized" accent
          meta={`${formatBytes(a.outSize)} · ${fmt(a.outFormat ?? 'webp')}${a.outQuality ? ` Q${a.outQuality}` : ''}`}
          dims={formatDims(a.outWidth ?? a.width, a.outHeight ?? a.height)} src={a.outputUrl ?? a.previewUrl} alt={`Optimized ${a.outName ?? a.name}`}
          note={!a.outputUrl ? 'demo: shows the original image' : undefined}
        />
      </div>
    </section>
  )
}

function Pane({ title, meta, dims, src, alt, accent, note }: { title: string; meta: string; dims: string; src: string; alt: string; accent?: boolean; note?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-low p-2">
      <div className="flex items-center justify-between px-1 font-mono text-xs">
        <span className={accent ? 'font-medium text-secondary' : 'text-muted'}>{title.toUpperCase()}</span>
        <span className={accent ? 'rounded bg-secondary/20 px-1.5 py-0.5 text-secondary' : 'rounded bg-surface-container px-1.5 py-0.5 text-white'}>{meta}</span>
      </div>
      <div className="relative aspect-video overflow-hidden rounded bg-black/40">
        <img src={src} alt={alt} className="h-full w-full object-cover" />
        <span className="tag absolute bottom-2 left-2">{dims} px</span>
        {note && <span className="tag absolute right-2 top-2 !text-tertiary">{note}</span>}
      </div>
    </div>
  )
}
