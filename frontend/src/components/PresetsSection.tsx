import clsx from 'clsx'
import { BookmarkPlus, Check, Info, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PRESETS } from '../lib/constants'
import { isModified, MAX_CUSTOM_PRESETS, NAME_MAX, presetSummary, recipeFrom, toPreset, type PresetError } from '../lib/presetStore'
import { useI18n, type TFn } from '../i18n'
import type { Presets } from '../state/usePresets'
import type { Preset, Settings } from '../types'

/** After an action removes the focused element, put focus somewhere sensible once React has re-rendered. */
const focusAfterRender = (selector: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`#presets-section ${selector}`)?.focus())
const rowSelector = (id: string) => `[data-preset-id="${id}"]`
const renameSelector = (id: string) => `[data-rename="${id}"]`

type Tab = 'builtin' | 'mine'
const TABS: Tab[] = ['builtin', 'mine']

interface Props {
  presets: Presets
  settings: Settings
  onApply: (p: Preset) => void
  /** The selected custom preset no longer exists (deleted here or in another tab). */
  onDeselect: () => void
}

/** Built-in and saved presets as tabs of one-line rows, with Save / Update underneath. */
export function PresetsSection({ presets, settings, onApply, onDeselect }: Props) {
  const { t } = useI18n()
  const selectedId = settings.presetId
  const mine = presets.list.map(toPreset)
  const selected = [...PRESETS, ...mine].find((p) => p.id === selectedId)
  const [tab, setTab] = useState<Tab>(() => (PRESETS.some((p) => p.id === selectedId) ? 'builtin' : presets.list.length ? 'mine' : 'builtin'))
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  // A selected custom preset that vanished (deleted in another tab, storage edited): drop the selection.
  useEffect(() => {
    if (selectedId?.startsWith('custom-') && !selected) onDeselect()
  }, [selectedId, selected, onDeselect])

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % 2 : e.key === 'ArrowLeft' ? (i + 1) % 2 : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null
    if (next === null) return
    e.preventDefault()
    setTab(TABS[next])
    tabRefs.current[TABS[next]]?.focus()
  }

  const rows = tab === 'builtin' ? PRESETS : mine
  const canUpdate = !!selected?.custom && isModified(settings, selected)
  return (
    <section id="presets-section" aria-labelledby="presets-heading" className="flex flex-col gap-2">
      <h3 id="presets-heading" className="section-label">{t('presets.title')}</h3>

      <div role="tablist" aria-label={t('presets.tabs')} className="flex gap-0.5 rounded-lg bg-surface-container-lowest p-0.5 text-xs">
        {TABS.map((id, i) => (
          <button
            key={id} ref={(el) => (tabRefs.current[id] = el)} type="button" role="tab" id={`presets-tab-${id}`} aria-selected={tab === id} aria-controls="presets-panel"
            tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => onTabKey(e, i)}
            className={clsx('flex-1 rounded-md px-2 py-1.5 transition-colors', tab === id ? 'bg-surface-container-highest font-semibold text-white' : 'text-on-surface-variant hover:text-white')}
          >
            {t(id === 'builtin' ? 'presets.tab.builtin' : 'presets.tab.mine')} · {id === 'builtin' ? PRESETS.length : `${presets.list.length}/${MAX_CUSTOM_PRESETS}`}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="presets-panel" aria-labelledby={`presets-tab-${tab}`} className="flex flex-col gap-1.5">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant/70 p-3 text-[11px] text-on-surface-variant">{t('presets.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((p) =>
              p.custom ? (
                <CustomRow key={p.id} preset={p} active={selectedId === p.id} modified={selectedId === p.id && isModified(settings, p)} presets={presets}
                  onApply={() => onApply(p)} onRemoved={() => { if (selectedId === p.id) onDeselect(); tabRefs.current.mine?.focus() }} />
              ) : (
                <li key={p.id}>
                  <RowButton preset={p} active={selectedId === p.id} modified={selectedId === p.id && isModified(settings, p)} onClick={() => onApply(p)} />
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        {canUpdate && selected && (
          <button type="button" className="btn-ghost w-full !py-1.5" onClick={() => { presets.update(selected.id, recipeFrom(settings)); focusAfterRender(rowSelector(selected.id)) }}>
            <span className="min-w-0 truncate">{t('presets.update', { name: selected.label })}</span>
          </button>
        )}
        <SaveNew presets={presets} settings={settings} onSaved={(p) => { setTab('mine'); onApply(p); focusAfterRender(rowSelector(p.id)) }} />
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-muted"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{t('presets.note')}</p>
    </section>
  )
}

function RowButton({ preset, active, modified, onClick }: { preset: Preset; active: boolean; modified: boolean; onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button" aria-pressed={active} onClick={onClick} data-preset-id={preset.id}
      className={clsx('flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all', active ? 'border-primary/70 bg-surface-container-highest shadow-glow-sm' : 'border-outline-variant/50 bg-surface-container hover:bg-surface-container-high')}
    >
      <span className="min-w-0">
        <span className={clsx('block truncate text-xs', active ? 'font-semibold text-primary' : 'font-medium text-white')}>{preset.label}</span>
        <span className={clsx('block truncate font-mono text-[11px]', active ? 'text-white/80' : 'text-muted')}>{presetSummary(preset, t('common.originalSize'))}</span>
      </span>
      {modified && <span className="shrink-0 rounded-full border border-tertiary/40 bg-tertiary/15 px-1.5 py-0.5 text-[11px] text-tertiary">{t('presets.modified')}</span>}
    </button>
  )
}

const errorText = (t: TFn, code: PresetError) => t(`presets.error.${code}`, { max: code === 'limit' ? MAX_CUSTOM_PRESETS : NAME_MAX })

function CustomRow({ preset, active, modified, presets, onApply, onRemoved }: { preset: Preset; active: boolean; modified: boolean; presets: Presets; onApply: () => void; onRemoved: () => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(preset.label)
  const [error, setError] = useState<PresetError | null>(null)
  const [confirming, setConfirming] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) input.current?.select() }, [editing])
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3500) // an unconfirmed delete disarms itself
    return () => clearTimeout(timer)
  }, [confirming])

  const save = () => {
    const r = presets.rename(preset.id, draft)
    if (r.error) return setError(r.error)
    stopEditing()
  }
  const stopEditing = () => { setEditing(false); setError(null); focusAfterRender(renameSelector(preset.id)) }

  if (editing) {
    return (
      <li className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-2">
        <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <label htmlFor={`rename-${preset.id}`} className="sr-only">{t('presets.nameLabel')}</label>
            <input
              id={`rename-${preset.id}`} ref={input} className="field" value={draft} maxLength={NAME_MAX} aria-invalid={!!error} aria-describedby={error ? `err-${preset.id}` : undefined}
              onChange={(e) => { setDraft(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setDraft(preset.label); stopEditing() } }}
            />
            {error && <p id={`err-${preset.id}`} role="alert" className="mt-1 text-[11px] text-error">{errorText(t, error)}</p>}
          </div>
          <button type="submit" className="btn-primary !px-2.5" aria-label={t('presets.saveName')}><Check className="h-3.5 w-3.5" aria-hidden /></button>
          <button type="button" className="btn-ghost !px-2" aria-label={t('presets.cancelRename')} onClick={() => { setDraft(preset.label); stopEditing() }}><X className="h-3.5 w-3.5" aria-hidden /></button>
        </form>
      </li>
    )
  }
  return (
    <li className="flex items-stretch gap-1">
      <div className="min-w-0 flex-1"><RowButton preset={preset} active={active} modified={modified} onClick={onApply} /></div>
      <button type="button" className="btn-ghost !px-2" aria-label={t('presets.rename', { name: preset.label })} data-rename={preset.id} onClick={() => { setDraft(preset.label); setEditing(true) }}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
      {confirming ? (
        <button type="button" className="btn border border-error/50 !bg-error-container !px-2 !text-error" onClick={() => { presets.remove(preset.id); onRemoved() }}>{t('presets.deleteConfirm')}</button>
      ) : (
        <button type="button" className="btn-ghost !px-2 hover:!text-error" aria-label={t('presets.delete', { name: preset.label })} onClick={() => setConfirming(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
      )}
    </li>
  )
}

/** "Save as new preset": a one-field inline form. */
function SaveNew({ presets, settings, onSaved }: { presets: Presets; settings: Settings; onSaved: (p: Preset) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<PresetError | null>(null)
  const full = presets.list.length >= MAX_CUSTOM_PRESETS
  const close = () => { setOpen(false); setName(''); setError(null); focusAfterRender('[data-save-new]') } // a cancelled draft is not kept

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = presets.add(name, recipeFrom(settings))
    if (r.error !== null) return setError(r.error)
    if (r.added) onSaved(toPreset(r.added))
    setOpen(false)
    setName('')
    setError(null)
  }

  if (!open) {
    return (
      <>
        <button type="button" className="btn-primary w-full !py-2" disabled={full} data-save-new onClick={() => setOpen(true)}>
          <BookmarkPlus className="h-4 w-4" aria-hidden /> {t('presets.save')}
        </button>
        {full && <p className="text-[11px] text-muted">{t('presets.limit', { max: MAX_CUSTOM_PRESETS })}</p>}
      </>
    )
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-low p-2.5">
      <label htmlFor="preset-name" className="text-[11px] text-on-surface-variant">{t('presets.nameLabel')}</label>
      <input
        id="preset-name" className="field" value={name} maxLength={NAME_MAX} autoFocus placeholder={t('presets.namePlaceholder')} aria-invalid={!!error} aria-describedby={error ? 'preset-name-error' : undefined}
        onChange={(e) => { setName(e.target.value); setError(null) }} onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      {error && <p id="preset-name-error" role="alert" className="text-[11px] text-error">{errorText(t, error)}</p>}
      <div className="flex gap-1.5">
        <button type="submit" className="btn-primary flex-1 !py-1.5">{t('presets.saveConfirm')}</button>
        <button type="button" className="btn-ghost" onClick={close}>{t('presets.cancel')}</button>
      </div>
    </form>
  )
}
