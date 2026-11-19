import clsx from 'clsx'
import { Archive, LoaderCircle, RefreshCw, SlidersHorizontal, X, Zap } from 'lucide-react'
import { NAMING_TOKENS, PRESETS } from '../lib/constants'
import { estimateOutputSize } from '../lib/estimate'
import { formatBytes, formatDims, labelFor } from '../lib/format'
import { outputSize } from '../lib/geometry'
import { buildName } from '../lib/naming'
import type { Batch } from '../state/useBatch'
import type { Asset, OutputFormat, ResizeMode } from '../types'
import { NumberField } from './ui/NumberField'
import { Segmented } from './ui/Segmented'
import { SliderField } from './ui/SliderField'
import { SwitchField } from './ui/SwitchField'

const FIT_OPTIONS: Array<{ value: ResizeMode; label: string; help: string }> = [
  { value: 'fit', label: 'Fit (contain within bounds)', help: 'The whole image stays inside the frame. Nothing is cropped or stretched.' },
  { value: 'cover', label: 'Fill (cover & center crop)', help: 'Fills the frame exactly. Edges that do not fit are cropped.' },
  { value: 'width', label: 'Width (height automatic)', help: 'Sets the width and keeps the aspect ratio.' },
  { value: 'original', label: 'Original size', help: 'No resize. Only format and quality change.' },
]
const FORMATS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'webp', label: 'WebP' }, { value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' },
]
const PLACEHOLDER: Asset = {
  id: 'x', name: 'photo.jpg', format: 'jpeg', size: 4_000_000, width: 4000, height: 3000, previewUrl: '', selected: true,
  uploadProgress: 100, status: 'pending', inBatch: false,
}

export function Inspector({ batch, open, onClose }: { batch: Batch; open: boolean; onClose: () => void }) {
  const { settings: s, updateSettings: set, phase, assets } = batch
  const locked = phase === 'processing'
  const lossy = s.format !== 'png'
  const fit = FIT_OPTIONS.find((f) => f.value === s.resizeMode)!
  const sample = assets.find((a) => a.selected) ?? assets[0] ?? PLACEHOLDER
  const [ow, oh] = outputSize(sample.width, sample.height, s)
  const manual = (p: Partial<typeof s>) => set({ presetId: null, ...p })

  return (
    <aside
      id="recipe-panel" aria-label="Batch recipe"
      className={clsx(
        'z-30 flex w-80 shrink-0 select-none flex-col overflow-hidden border-l border-outline-variant/60 bg-surface',
        'max-desk:fixed max-desk:bottom-0 max-desk:right-0 max-desk:top-13 max-desk:z-50 max-desk:shadow-2xl max-desk:transition-transform',
        open ? 'max-desk:translate-x-0' : 'max-desk:invisible max-desk:translate-x-full',
      )}
    >
      <div className="flex items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest/70 p-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white">
          <SlidersHorizontal className="h-[18px] w-[18px] text-primary" aria-hidden /> Batch recipe
        </h2>
        <button type="button" onClick={onClose} aria-label="Close recipe panel" className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-white desk:hidden">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <fieldset disabled={locked} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-xs disabled:opacity-60">
        <legend className="sr-only">Processing settings{locked ? ' (locked while processing)' : ''}</legend>

        <section className="flex flex-col gap-1.5">
          <h3 className="section-label">Workflow presets</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => {
              const active = s.presetId === p.id
              return (
                <button
                  key={p.id} type="button" aria-pressed={active} onClick={() => batch.applyPreset(p.id)}
                  className={clsx('flex flex-col rounded-lg border p-2 text-left transition-all', active ? 'border-primary/70 bg-surface-container-highest shadow-glow-sm' : 'border-outline-variant/50 bg-surface-container hover:bg-surface-container-high')}
                >
                  <span className="flex items-center justify-between">
                    <span className={clsx('truncate', active ? 'font-semibold text-primary' : 'font-medium text-white')}>{p.label}</span>
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
                  </span>
                  <span className={clsx('font-mono text-[11px]', active ? 'text-white/80' : 'text-muted')}>{p.width}×{p.height} · {labelFor(p.format)}</span>
                </button>
              )
            })}
          </div>
        </section>

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2">
          <h3 className="section-label">Geometry &amp; scaling</h3>
          <div className="flex flex-col gap-1">
            <label htmlFor="fit-mode" className="text-[11px] text-on-surface-variant">Fitting mode</label>
            <select id="fit-mode" value={s.resizeMode} onChange={(e) => manual({ resizeMode: e.target.value as ResizeMode })} className="field">
              {FIT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <p className="text-[11px] text-muted">{fit.help}</p>
          </div>
          {s.resizeMode !== 'original' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <NumberField label={s.resizeMode === 'width' ? 'Width' : 'Max width'} value={s.width} suffix="px" onChange={(n) => manual({ width: n })} />
              {s.resizeMode !== 'width' && <NumberField label={s.resizeMode === 'cover' ? 'Height' : 'Max height'} value={s.height} suffix="px" onChange={(n) => manual({ height: n })} />}
            </div>
          )}
        </section>

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="section-label">Format &amp; quality</h3>
            <span className="font-mono text-xs font-bold text-primary" aria-hidden>{lossy ? `${s.quality}%` : '—'}</span>
          </div>
          <Segmented label="Output format" value={s.format} options={FORMATS} onChange={(format) => manual({ format })} />
          <div className="flex flex-col gap-1 pt-1">
            <SliderField label={`Quality ${s.quality}`} value={s.quality} disabled={!lossy} onChange={(quality) => manual({ quality })} />
            {lossy ? (
              <div className="flex justify-between font-mono text-[11px] text-muted"><span>Smaller</span><span>Balanced</span><span>Best</span></div>
            ) : (
              <p className="text-[11px] text-muted">PNG is lossless, so quality does not apply.</p>
            )}
          </div>
          {s.format === 'jpeg' && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <label htmlFor="bg-color" className="text-[11px] text-on-surface-variant">
                Background for transparent areas
                <span className="block text-muted">JPEG cannot store transparency.</span>
              </label>
              <input id="bg-color" type="color" value={s.background} onChange={(e) => set({ background: e.target.value })} className="h-8 w-10 shrink-0 rounded border border-outline-variant bg-surface-container p-0.5" />
            </div>
          )}
        </section>

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2">
          <h3 className="section-label">Output naming rules</h3>
          <div className="flex flex-col gap-1">
            <label htmlFor="pattern" className="sr-only">Naming pattern</label>
            <input id="pattern" className="field font-mono" value={s.pattern} maxLength={80} onChange={(e) => set({ pattern: e.target.value })} spellCheck={false} />
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-[11px]">
              {NAMING_TOKENS.map((t) => (
                <button key={t} type="button" onClick={() => set({ pattern: s.pattern + t })} aria-label={`Add ${t} to pattern`} className="rounded bg-surface-container px-1.5 py-0.5 text-muted hover:text-white">+{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_4rem_4rem] gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="prefix" className="text-[11px] text-on-surface-variant">Prefix</label>
              <input id="prefix" className="field font-mono" value={s.prefix} maxLength={40} onChange={(e) => set({ prefix: e.target.value })} spellCheck={false} />
            </div>
            <NumberField label="Pad" value={s.padding} min={1} max={6} onChange={(n) => set({ padding: n })} />
            <NumberField label="Start" value={s.startIndex} min={0} max={99999} onChange={(n) => set({ startIndex: n })} />
          </div>
          <div className="flex items-center gap-1.5 rounded bg-surface-container-low p-2 font-mono text-[11px]">
            <span className="text-muted">Preview:</span>
            <span className="truncate text-secondary" title={buildName(sample, 0, s)}>{buildName(sample, 0, s)}</span>
          </div>
        </section>

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2">
          <h3 className="section-label">Sanitization &amp; safety</h3>
          <SwitchField label="Strip GPS & EXIF data" hint="Removes location and camera information from every output file." checked={s.removeMetadata} onChange={(removeMetadata) => set({ removeMetadata })} />
        </section>

        <section aria-label="Output preview" className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-2.5 font-mono text-[11px]">
          <div className="mb-1 text-muted">Preview · {assets.length ? 'first selected' : 'example 4000×3000'}</div>
          <div className="text-on-surface">{formatDims(sample.width, sample.height)} → <span className="text-primary">{formatDims(ow, oh)}</span> · {labelFor(s.format)}</div>
          <div className="text-on-surface-variant">≈ {formatBytes(estimateOutputSize(sample, s))} <span className="rounded bg-surface-container px-1 py-0.5 text-muted">estimated</span></div>
        </section>
      </fieldset>

      <Footer batch={batch} />
    </aside>
  )
}

function Footer({ batch }: { batch: Batch }) {
  const { phase, stats, pendingSelected, outputTotal } = batch
  const exportable = stats.completed > 0 && phase !== 'processing' && phase !== 'uploading'
  let primary: React.ReactNode
  if (phase === 'processing') {
    primary = <button type="button" className="btn-primary w-full !py-2.5" disabled><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Processing {stats.completed + stats.failed}/{stats.total}</button>
  } else if (phase === 'partial') {
    primary = <button type="button" className="btn-primary w-full !py-2.5" onClick={batch.retryFailed}><RefreshCw className="h-4 w-4" aria-hidden /> Retry {stats.failed} failed</button>
  } else if (phase === 'failed') {
    primary = <button type="button" className="btn-primary w-full !py-2.5" onClick={batch.process}><RefreshCw className="h-4 w-4" aria-hidden /> Try again</button>
  } else if (phase === 'completed') {
    primary = <button type="button" className="btn-ghost w-full !py-2.5" onClick={batch.reprocess}><RefreshCw className="h-4 w-4" aria-hidden /> Process again with these settings</button>
  } else {
    primary = <button type="button" className="btn-primary w-full !py-2.5" onClick={batch.process} disabled={pendingSelected === 0 || phase === 'uploading'}><Zap className="h-4 w-4" aria-hidden /> Process batch ({pendingSelected} {pendingSelected === 1 ? 'asset' : 'assets'})</button>
  }
  return (
    <div className="flex flex-col gap-2 border-t border-outline-variant/60 bg-surface-container-lowest p-4">
      {primary}
      <button type="button" className="btn-export w-full !py-2" disabled={!exportable} onClick={batch.exportZip}>
        <Archive className="h-4 w-4" aria-hidden /> Export all as ZIP{exportable ? ` (${formatBytes(outputTotal)})` : ''}
      </button>
    </div>
  )
}
