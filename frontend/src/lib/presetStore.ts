/**
 * Custom presets live in the browser (localStorage) — no backend, no account.
 * Everything here is pure so it can be unit-tested; the localStorage access is in state/usePresets.ts.
 * localStorage is user-editable, so whatever is read back is validated field by field.
 */
import type { OutputFormat, Preset, ResizeMode, Settings } from '../types'
import { PRESETS } from './constants'

export const MAX_CUSTOM_PRESETS = 10
export const NAME_MAX = 30
export const STORAGE_KEY = 'cbt.presets.v1'

/** What a preset remembers. The prefix and start index are per-batch details, so they are not saved. */
export type PresetRecipe = Pick<Settings, 'resizeMode' | 'width' | 'height' | 'format' | 'quality' | 'background' | 'removeMetadata' | 'pattern' | 'padding'>

export interface CustomPreset {
  id: string
  name: string
  createdAt: string
  recipe: PresetRecipe
}

const MODES: ResizeMode[] = ['fit', 'cover', 'width', 'original']
const FORMATS: OutputFormat[] = ['webp', 'jpeg', 'png']

export const recipeFrom = (s: Settings): PresetRecipe => ({
  resizeMode: s.resizeMode, width: s.width, height: s.height, format: s.format, quality: s.quality,
  background: s.background, removeMetadata: s.removeMetadata, pattern: s.pattern, padding: s.padding,
})

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

function parseRecipe(r: unknown): PresetRecipe | null {
  if (typeof r !== 'object' || r === null) return null
  const x = r as Record<string, unknown>
  if (!MODES.includes(x.resizeMode as ResizeMode) || !FORMATS.includes(x.format as OutputFormat)) return null
  if (!isInt(x.width, 1, 8000) || !isInt(x.height, 1, 8000) || !isInt(x.quality, 1, 100) || !isInt(x.padding, 1, 6)) return null
  if (typeof x.background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x.background)) return null
  if (typeof x.removeMetadata !== 'boolean' || typeof x.pattern !== 'string' || x.pattern.length > 80) return null
  return {
    resizeMode: x.resizeMode as ResizeMode, width: x.width, height: x.height, format: x.format as OutputFormat, quality: x.quality,
    background: x.background, removeMetadata: x.removeMetadata, pattern: x.pattern, padding: x.padding,
  }
}

/** Tolerant reader: bad JSON, wrong shapes, duplicates and overflow are dropped instead of crashing the app. */
export function parseStored(raw: string | null): CustomPreset[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: CustomPreset[] = []
  const seen = new Set<string>()
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue
    const { id, name, createdAt, recipe } = item as Record<string, unknown>
    const clean = typeof name === 'string' ? name.trim() : ''
    const rec = parseRecipe(recipe)
    if (typeof id !== 'string' || !/^custom-[\w-]{1,48}$/.test(id) || seen.has(id)) continue
    if (!clean || clean.length > NAME_MAX || !rec) continue
    seen.add(id)
    out.push({ id, name: clean, createdAt: typeof createdAt === 'string' ? createdAt.slice(0, 40) : '', recipe: rec })
    if (out.length >= MAX_CUSTOM_PRESETS) break
  }
  return out
}

/** Error message, or null when the name is acceptable. Built-in names are reserved too. */
export function validateName(name: string, list: CustomPreset[], exceptId?: string): string | null {
  const n = name.trim()
  if (!n) return 'Give the preset a name.'
  if (n.length > NAME_MAX) return `Use at most ${NAME_MAX} characters.`
  const taken = [...PRESETS.map((p) => p.label), ...list.filter((p) => p.id !== exceptId).map((p) => p.name)]
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase())) return 'A preset with this name already exists.'
  return null
}

export type Result = { list: CustomPreset[]; error: null; added?: CustomPreset } | { list: CustomPreset[]; error: string }

export function addPreset(list: CustomPreset[], name: string, recipe: PresetRecipe, id: string, now: string): Result {
  if (list.length >= MAX_CUSTOM_PRESETS) return { list, error: `You can keep up to ${MAX_CUSTOM_PRESETS} presets. Delete one first.` }
  const error = validateName(name, list)
  if (error) return { list, error }
  const added: CustomPreset = { id, name: name.trim(), createdAt: now, recipe }
  return { list: [...list, added], error: null, added }
}

export function renamePreset(list: CustomPreset[], id: string, name: string): Result {
  const error = validateName(name, list, id)
  if (error) return { list, error }
  return { list: list.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)), error: null }
}

export const removePreset = (list: CustomPreset[], id: string): CustomPreset[] => list.filter((p) => p.id !== id)

export const toPreset = (c: CustomPreset): Preset => ({ id: c.id, label: c.name, custom: true, ...c.recipe })

const MODE_LABEL: Record<ResizeMode, string> = { fit: 'Fit', cover: 'Fill', width: 'Width', original: 'Original' }
/** One-line summary for lists, e.g. "1200×1200 · Fit · JPEG Q90". */
export function describe(r: PresetRecipe): string {
  const size = r.resizeMode === 'original' ? 'Original size' : r.resizeMode === 'width' ? `Width ${r.width}` : `${r.width}×${r.height}`
  const fmt = r.format === 'png' ? 'PNG' : `${r.format === 'jpeg' ? 'JPEG' : 'WebP'} Q${r.quality}`
  return `${size} · ${MODE_LABEL[r.resizeMode]} · ${fmt}`
}
