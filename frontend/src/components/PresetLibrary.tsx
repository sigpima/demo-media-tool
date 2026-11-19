import * as Dialog from '@radix-ui/react-dialog'
import { Check, Info, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PRESETS } from '../lib/constants'
import { describe, MAX_CUSTOM_PRESETS, NAME_MAX, toPreset } from '../lib/presetStore'
import type { Presets } from '../state/usePresets'
import type { Preset } from '../types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: Presets
  activeId: string | null
  onApply: (p: Preset) => void
  /** Radix only restores focus for its own Trigger; this dialog is opened from elsewhere, so we say where focus goes back to. */
  returnFocusTo: React.RefObject<HTMLElement | null>
}

/** Manage saved presets: apply, rename, delete. Built-in presets are listed read-only. */
export function PresetLibrary({ open, onOpenChange, presets, activeId, onApply, returnFocusTo }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content onCloseAutoFocus={(e) => { e.preventDefault(); returnFocusTo.current?.focus() }} className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(36rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant/60 p-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-white">Presets</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-on-surface-variant">
                Save the current settings from the recipe panel, then reuse them in one click.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-white" aria-label="Close">
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <section aria-labelledby="mine">
              <h3 id="mine" className="section-label mb-2">Your presets · {presets.list.length}/{MAX_CUSTOM_PRESETS}</h3>
              {presets.list.length === 0 ? (
                <p className="rounded-lg border border-dashed border-outline-variant/70 p-4 text-xs text-on-surface-variant">
                  Nothing saved yet. Set up the recipe panel the way you like, then choose <span className="text-white">Save current settings as preset</span>.
                </p>
              ) : (
                <ul className="space-y-2">
                  {presets.list.map((c) => (
                    <Row key={c.id} id={c.id} name={c.name} summary={describe(c.recipe)} active={activeId === c.id} presets={presets}
                      onApply={() => { onApply(toPreset(c)); onOpenChange(false) }} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="builtin">
              <h3 id="builtin" className="section-label mb-2">Built-in</h3>
              <ul className="space-y-1.5">
                {PRESETS.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2 text-xs">
                    <span className="font-medium text-white">{p.label}</span>
                    <span className="font-mono text-[11px] text-muted">{p.width}×{p.height} · {p.format === 'jpeg' ? 'JPEG' : 'WebP'} Q{p.quality}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <p className="flex items-start gap-2 border-t border-outline-variant/60 p-3 text-[11px] text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Saved in this browser only. They are not uploaded, and clearing the site data removes them. A preset keeps the size, format, quality,
            background colour, metadata choice and naming pattern — not the prefix or start number.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Row({ id, name, summary, active, presets, onApply }: { id: string; name: string; summary: string; active: boolean; presets: Presets; onApply: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) input.current?.select() }, [editing])
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3500) // an unconfirmed delete disarms itself
    return () => clearTimeout(t)
  }, [confirming])

  const save = () => {
    const r = presets.rename(id, draft)
    if (r.error) return setError(r.error)
    setEditing(false)
    setError(null)
  }

  return (
    <li className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-3">
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex items-start gap-2">
          <div className="flex-1">
            <label htmlFor={`rename-${id}`} className="sr-only">Preset name</label>
            <input id={`rename-${id}`} ref={input} className="field" value={draft} maxLength={NAME_MAX} aria-invalid={!!error} aria-describedby={error ? `err-${id}` : undefined}
              onChange={(e) => { setDraft(e.target.value); setError(null) }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setError(null) } }} />
            {error && <p id={`err-${id}`} role="alert" className="mt-1 text-[11px] text-error">{error}</p>}
          </div>
          <button type="submit" className="btn-primary !px-3" aria-label="Save name"><Check className="h-3.5 w-3.5" aria-hidden /></button>
          <button type="button" className="btn-ghost" aria-label="Cancel rename" onClick={() => { setEditing(false); setError(null); setDraft(name) }}><X className="h-3.5 w-3.5" aria-hidden /></button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-white">{name}</span>
              {active && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">in use</span>}
            </div>
            <div className="truncate font-mono text-[11px] text-muted">{summary}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" className="btn-ghost" onClick={onApply}>Apply</button>
            <button type="button" className="btn-ghost !px-2" aria-label={`Rename ${name}`} onClick={() => { setDraft(name); setEditing(true) }}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
            {confirming ? (
              <button type="button" className="btn !bg-error-container !text-error border border-error/50" onClick={() => presets.remove(id)}>Delete?</button>
            ) : (
              <button type="button" className="btn-ghost !px-2 hover:!text-error" aria-label={`Delete ${name}`} onClick={() => setConfirming(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
