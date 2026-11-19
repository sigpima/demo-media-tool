import clsx from 'clsx'
import { Archive, LoaderCircle, RefreshCw, SlidersHorizontal, X, Zap } from 'lucide-react'
import { useCallback } from 'react'
import { useI18n } from '../i18n'
import { NAMING_TOKENS } from '../lib/constants'
import { estimateOutputSize } from '../lib/estimate'
import { formatBytes, formatDims, labelFor } from '../lib/format'
import { outputSize } from '../lib/geometry'
import { buildName } from '../lib/naming'
import type { Batch } from '../state/useBatch'
import type { Presets } from '../state/usePresets'
import type { Asset, OutputFormat } from '../types'
import { FitModePicker } from './FitModePicker'
import { PresetsSection } from './PresetsSection'
import { NumberField } from './ui/NumberField'
import { Segmented } from './ui/Segmented'
import { SliderField } from './ui/SliderField'
import { SwitchField } from './ui/SwitchField'

const FORMATS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'webp', label: 'WebP' }, { value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' },
]
const PLACEHOLDER: Asset = {
  id: 'x', name: 'photo.jpg', format: 'jpeg', size: 4_000_000, width: 4000, height: 3000, previewUrl: '', selected: true,
  uploadProgress: 100, status: 'pending', inBatch: false,
}

export function Inspector({ batch, presets, open, onClose }: { batch: Batch; presets: Presets; open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { settings: s, updateSettings: set, phase, assets } = batch
  const locked = phase === 'processing'
  const lossy = s.format !== 'png'
  const sample = assets.find((a) => a.selected) ?? assets[0] ?? PLACEHOLDER
  const [ow, oh] = outputSize(sample.width, sample.height, s)
  // Editing keeps the selected preset: the Presets section shows a "Modified" tag instead of dropping the selection.
  const manual = set
  const deselect = useCallback(() => set({ presetId: null }), [set])

  return (
    <aside
      id="recipe-panel" aria-label={t('inspector.panel')}
      className={clsx(
        'z-30 flex w-80 shrink-0 select-none flex-col overflow-hidden border-l border-outline-variant/60 bg-surface',
        'max-desk:fixed max-desk:bottom-0 max-desk:right-0 max-desk:top-13 max-desk:z-50 max-desk:shadow-2xl max-desk:transition-transform',
        open ? 'max-desk:translate-x-0' : 'max-desk:invisible max-desk:translate-x-full',
      )}
    >
      <div className="flex items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest/70 p-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white">
          <SlidersHorizontal className="h-[18px] w-[18px] text-primary" aria-hidden /> {t('inspector.heading')}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('inspector.close')} className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-white desk:hidden">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <fieldset disabled={locked} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-xs disabled:opacity-60">
        <legend className="sr-only">{t('inspector.legend')}{locked ? t('inspector.locked') : ''}</legend>

        <PresetsSection presets={presets} settings={s} onApply={batch.applyPreset} onDeselect={deselect} />

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2">
          <h3 className="section-label">{t('inspector.geometry')}</h3>
          <FitModePicker value={s.resizeMode} onChange={(resizeMode) => manual({ resizeMode })} />
          {s.resizeMode !== 'original' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <NumberField label={s.resizeMode === 'width' ? t('inspector.width') : t('inspector.maxWidth')} value={s.width} suffix="px" onChange={(n) => manual({ width: n })} />
              {s.resizeMode !== 'width' && <NumberField label={s.resizeMode === 'cover' ? t('inspector.height') : t('inspector.maxHeight')} value={s.height} suffix="px" onChange={(n) => manual({ height: n })} />}
            </div>
          )}
        </section>

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="section-label">{t('inspector.format')}</h3>
            <span className="font-mono text-xs font-bold text-primary" aria-hidden>{lossy ? `${s.quality}%` : '—'}</span>
          </div>
          <Segmented label={t('inspector.outputFormat')} value={s.format} options={FORMATS} onChange={(format) => manual({ format })} />
          <div className="flex flex-col gap-1 pt-1">
            <SliderField label={t('inspector.quality', { q: s.quality })} value={s.quality} disabled={!lossy} onChange={(quality) => manual({ quality })} />
            {lossy ? (
              <div className="flex justify-between font-mono text-[11px] text-muted"><span>{t('inspector.smaller')}</span><span>{t('inspector.balanced')}</span><span>{t('inspector.best')}</span></div>
            ) : (
              <p className="text-[11px] text-muted">{t('inspector.pngLossless')}</p>
            )}
          </div>
          {s.format === 'jpeg' && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <label htmlFor="bg-color" className="text-[11px] text-on-surface-variant">
                {t('inspector.bg')}
                <span className="block text-muted">{t('inspector.bgHint')}</span>
              </label>
              <input id="bg-color" type="color" value={s.background} onChange={(e) => set({ background: e.target.value })} className="h-8 w-10 shrink-0 rounded border border-outline-variant bg-surface-container p-0.5" />
            </div>
          )}
        </section>

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2">
          <h3 className="section-label">{t('inspector.naming')}</h3>
          <div className="flex flex-col gap-1">
            <label htmlFor="pattern" className="sr-only">{t('inspector.pattern')}</label>
            <input id="pattern" className="field font-mono" value={s.pattern} maxLength={80} onChange={(e) => set({ pattern: e.target.value })} spellCheck={false} />
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-[11px]">
              {NAMING_TOKENS.map((token) => (
                <button key={token} type="button" onClick={() => set({ pattern: s.pattern + token })} aria-label={t('inspector.addToken', { token })} className="rounded bg-surface-container px-1.5 py-0.5 text-muted hover:text-white">+{token}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_4rem_4rem] gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="prefix" className="text-[11px] text-on-surface-variant">{t('inspector.prefix')}</label>
              <input id="prefix" className="field font-mono" value={s.prefix} maxLength={40} onChange={(e) => set({ prefix: e.target.value })} spellCheck={false} />
            </div>
            <NumberField label={t('inspector.pad')} value={s.padding} min={1} max={6} onChange={(n) => set({ padding: n })} />
            <NumberField label={t('inspector.start')} value={s.startIndex} min={0} max={99999} onChange={(n) => set({ startIndex: n })} />
          </div>
          <div className="flex items-center gap-1.5 rounded bg-surface-container-low p-2 font-mono text-[11px]">
            <span className="text-muted">{t('inspector.previewName')}</span>
            <span className="truncate text-secondary" title={buildName(sample, 0, s)}>{buildName(sample, 0, s)}</span>
          </div>
        </section>

        <hr className="border-outline-variant/40" />

        <section className="flex flex-col gap-2">
          <h3 className="section-label">{t('inspector.safety')}</h3>
          <SwitchField label={t('inspector.strip')} hint={t('inspector.stripHint')} checked={s.removeMetadata} onChange={(removeMetadata) => set({ removeMetadata })} />
        </section>

        <section aria-label={t('inspector.outputPreview')} className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-2.5 font-mono text-[11px]">
          <div className="mb-1 text-muted">{assets.length ? t('inspector.previewFirst') : t('inspector.previewExample')}</div>
          <div className="text-on-surface">{formatDims(sample.width, sample.height)} → <span className="text-primary">{formatDims(ow, oh)}</span> · {labelFor(s.format)}</div>
          <div className="text-on-surface-variant">≈ {formatBytes(estimateOutputSize(sample, s))} <span className="rounded bg-surface-container px-1 py-0.5 text-muted">{t('inspector.estimated')}</span></div>
        </section>
      </fieldset>

      <Footer batch={batch} />
    </aside>
  )
}

function Footer({ batch }: { batch: Batch }) {
  const { t } = useI18n()
  const { phase, stats, pendingSelected, outputTotal } = batch
  const exportable = stats.completed > 0 && phase !== 'processing' && phase !== 'uploading'
  let primary: React.ReactNode
  if (phase === 'processing') {
    primary = <button type="button" className="btn-primary w-full !py-2.5" disabled><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> {t('inspector.processingN', { a: stats.completed + stats.failed, b: stats.total })}</button>
  } else if (phase === 'partial') {
    primary = <button type="button" className="btn-primary w-full !py-2.5" onClick={batch.retryFailed}><RefreshCw className="h-4 w-4" aria-hidden /> {t('inspector.retryN', { n: stats.failed })}</button>
  } else if (phase === 'failed') {
    primary = <button type="button" className="btn-primary w-full !py-2.5" onClick={batch.process}><RefreshCw className="h-4 w-4" aria-hidden /> {t('inspector.tryAgain')}</button>
  } else if (phase === 'completed') {
    primary = <button type="button" className="btn-ghost w-full !py-2.5" onClick={batch.reprocess}><RefreshCw className="h-4 w-4" aria-hidden /> {t('inspector.again')}</button>
  } else {
    primary = <button type="button" className="btn-primary w-full !py-2.5" onClick={batch.process} disabled={pendingSelected === 0 || phase === 'uploading'}><Zap className="h-4 w-4" aria-hidden /> {t('inspector.process', { count: pendingSelected })}</button>
  }
  return (
    <div className="flex flex-col gap-2 border-t border-outline-variant/60 bg-surface-container-lowest p-4">
      {primary}
      <button type="button" className="btn-export w-full !py-2" disabled={!exportable} onClick={batch.exportZip}>
        <Archive className="h-4 w-4" aria-hidden /> {t('inspector.export')}{exportable ? ` (${formatBytes(outputTotal)})` : ''}
      </button>
    </div>
  )
}
