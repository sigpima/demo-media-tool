import clsx from 'clsx'
import { ArrowLeftRight, ChevronsLeftRight, Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clampPct, frameStyle, nextPct, pctFromPointer } from '../lib/compare'
import { formatBytes, formatDims, formatSaving, labelFor } from '../lib/format'
import { useI18n } from '../i18n'
import type { Batch } from '../state/useBatch'

/** Before/after panel: one frame, original on the left of the divider and optimized on the right. */
export function ComparePanel({ batch }: { batch: Batch }) {
  const { t } = useI18n()
  const a = batch.inspected
  const [pct, setPct] = useState(50)
  useEffect(() => setPct(50), [a?.id])
  if (!a || a.outSize == null) return null

  const saving = formatSaving(a.size, a.outSize)
  const outW = a.outWidth ?? a.width
  const outH = a.outHeight ?? a.height
  const optimizedSrc = a.outputUrl ?? a.previewUrl
  return (
    <section id="compare-panel" aria-label={t('compare.section')} className="flex flex-col gap-4 rounded-xl border border-outline-variant/60 bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ArrowLeftRight className="h-[18px] w-[18px] text-primary" aria-hidden />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white">{t('compare.title')}</h2>
            <span className="font-mono text-xs text-on-surface-variant">{t('compare.inspecting', { name: a.name })}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={saving.smaller ? 'rounded-full border border-secondary/30 bg-secondary/15 px-2.5 py-1 font-mono text-xs font-medium text-secondary' : 'rounded-full border border-tertiary/30 bg-tertiary/15 px-2.5 py-1 font-mono text-xs font-medium text-tertiary'}>
            {saving.smaller ? t('compare.smaller', { saving: saving.text, bytes: formatBytes(a.size - a.outSize) }) : t('compare.larger', { saving: saving.text })}
          </span>
          <button type="button" className="btn-export" onClick={() => batch.download(a.id)}>
            <Download className="h-[15px] w-[15px]" aria-hidden /> {t('compare.download')}
          </button>
        </div>
      </div>

      <Frame
        pct={pct} onChange={setPct} style={frameStyle(outW, outH)}
        originalSrc={a.previewUrl} optimizedSrc={optimizedSrc}
        originalAlt={t('compare.altOriginal', { name: a.name })} optimizedAlt={t('compare.altOptimized', { name: a.outName ?? a.name })}
        note={!a.outputUrl ? t('compare.demo') : undefined}
      />

      <div className="grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-2">
        <Meta title={t('compare.original')} text={`${formatBytes(a.size)} · ${labelFor(a.format)} · ${formatDims(a.width, a.height)} px`} />
        <Meta title={t('compare.optimized')} accent text={`${formatBytes(a.outSize)} · ${labelFor(a.outFormat ?? 'webp')}${a.outQuality ? ` Q${a.outQuality}` : ''} · ${formatDims(outW, outH)} px`} />
      </div>
      <p className="text-[11px] text-muted">{t('compare.note')}</p>
    </section>
  )
}

function Meta({ title, text, accent }: { title: string; text: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2.5 py-1.5">
      <span className={accent ? 'font-medium uppercase text-secondary' : 'uppercase text-muted'}>{title}</span>
      <span className={accent ? 'rounded bg-secondary/20 px-1.5 py-0.5 text-secondary' : 'rounded bg-surface-container px-1.5 py-0.5 text-white'}>{text}</span>
    </div>
  )
}

interface FrameProps {
  pct: number
  onChange: (n: number) => void
  style: { aspectRatio: string; width: string }
  originalSrc: string
  optimizedSrc: string
  originalAlt: string
  optimizedAlt: string
  note?: string
}

/** Both images use object-cover in a frame with the output's aspect ratio, so they line up in Fit, Width and Fill (centre crop). */
function Frame({ pct, onChange, style, originalSrc, optimizedSrc, originalAlt, optimizedAlt, note }: FrameProps) {
  const { t } = useI18n()
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const moved = useRef(false)
  const moveTo = (clientX: number) => {
    const r = frame.current?.getBoundingClientRect()
    if (r) onChange(pctFromPointer(clientX, r))
  }
  return (
    <div
      ref={frame} style={{ ...style, touchAction: 'pan-y' }}
      className="relative mx-auto max-w-full cursor-ew-resize select-none overflow-hidden rounded-lg border border-outline-variant/40 bg-black/40"
      onPointerDown={(e) => {
        if (e.button !== 0) return // only the primary button drags
        dragging.current = true
        moved.current = false
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
        if (e.pointerType !== 'touch') moveTo(e.clientX) // a touch may turn into a scroll, so it only counts once it moves or ends as a tap
      }}
      onPointerMove={(e) => { if (dragging.current && e.buttons !== 0) { moved.current = true; moveTo(e.clientX) } }}
      onPointerUp={(e) => { if (dragging.current && e.pointerType === 'touch' && !moved.current) moveTo(e.clientX); dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
      onLostPointerCapture={() => { dragging.current = false }}
    >
      <img src={originalSrc} alt={originalAlt} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      <img src={optimizedSrc} alt={optimizedAlt} draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${pct}%)` }} />
      <span className="tag absolute bottom-2 left-2">{t('compare.original')}</span>
      <span className="tag absolute bottom-2 right-2 !text-secondary">{t('compare.optimized')}</span>
      {note && <span className="tag absolute left-2 top-2 !text-tertiary">{note}</span>}

      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,.6)]" style={{ left: `${pct}%` }}>
        <div
          role="slider" tabIndex={0} aria-orientation="horizontal" aria-label={t('compare.slider')}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
          aria-valuetext={t('compare.valuetext', { orig: Math.round(pct), opt: Math.round(100 - pct) })}
          onKeyDown={(e) => {
            const next = nextPct(pct, e.key, e.shiftKey)
            if (next === null) return
            e.preventDefault()
            onChange(clampPct(next))
          }}
          className={clsx('pointer-events-auto absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-surface/90 text-white shadow-lg', 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary')}
        >
          <ChevronsLeftRight className="h-4 w-4" aria-hidden />
        </div>
      </div>
    </div>
  )
}
