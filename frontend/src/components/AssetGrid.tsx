import type { Batch } from '../state/useBatch'
import { AssetCard } from './AssetCard'

export function AssetGrid({ batch, onCompare }: { batch: Batch; onCompare: (id: string) => void }) {
  const { assets, phase, settings, selectedCount, inspected } = batch
  if (assets.length === 0) return null
  const busy = phase === 'processing' || phase === 'uploading'
  const all = selectedCount === assets.length

  return (
    <section aria-label="Assets" className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1 py-1 text-xs">
        <label className="flex select-none items-center gap-2 font-medium text-white">
          <input
            type="checkbox" className="h-4 w-4 rounded accent-primary" checked={all} disabled={busy}
            ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && !all }}
            onChange={() => batch.setAllSelected(!all)}
          />
          <span aria-live="polite">{selectedCount} of {assets.length} assets selected</span>
        </label>
        {selectedCount > 0 && (
          <button type="button" className="text-primary hover:underline disabled:opacity-45" disabled={busy} onClick={() => batch.setAllSelected(false)}>
            Select none
          </button>
        )}
      </div>
      <ul className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {assets.map((a) => (
          <AssetCard
            key={a.id} asset={a} phase={phase} settings={settings} inspecting={inspected?.id === a.id}
            onToggle={() => batch.toggleSelect(a.id)} onRemove={() => batch.remove(a.id)} onRetry={() => batch.retry([a.id])}
            onCompare={() => onCompare(a.id)} onDownload={() => batch.download(a.id)}
          />
        ))}
      </ul>
    </section>
  )
}
