import { CloudUpload, FolderOpen } from 'lucide-react'
import type { Limits } from '../lib/limits'

export function UploadZone({ large, limits, onBrowse, onDemo }: { large: boolean; limits: Limits; onBrowse: () => void; onDemo?: () => void }) {
  const mb = Math.round(limits.maxFileBytes / 1024 / 1024)
  const summary = `JPG, PNG or WebP · up to ${mb} MB each · up to ${limits.maxFiles} files`
  if (large) {
    return (
      <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/80 bg-surface/50 p-8 text-center transition-colors hover:border-primary/70 hover:bg-surface-container-low/60">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <CloudUpload className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="text-base font-semibold text-white">Drag images here to start a batch</h2>
        <p className="mt-1 text-xs text-on-surface-variant">{summary}</p>
        <div className="mt-5 flex items-center gap-3">
          <button type="button" className="btn-primary !px-5 !py-2" onClick={onBrowse}>
            <FolderOpen className="h-4 w-4" aria-hidden /> Browse files
          </button>
          {onDemo && (
            <button type="button" className="btn-ghost !py-2" onClick={onDemo}>
              Load sample images
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-dashed border-outline-variant/80 bg-surface/50 p-3.5 text-xs transition-colors hover:border-primary/70 hover:bg-surface-container-low/60 sm:flex-row">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <CloudUpload className="h-[18px] w-[18px]" aria-hidden />
        </div>
        <p>
          <span className="font-medium text-white">Quick dropzone</span>
          <span className="ml-1 text-on-surface-variant">Drop more images anywhere on this page to append them to the batch.</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button type="button" className="btn-ghost !py-1 font-mono !text-[11px]" onClick={onBrowse}>
          <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Browse files
        </button>
        <span className="hidden font-mono text-[11px] text-muted desk:inline">{mb} MB / file</span>
      </div>
    </div>
  )
}
