import { describe as suite, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './constants'
import { addPreset, describe, MAX_CUSTOM_PRESETS, NAME_MAX, parseStored, recipeFrom, removePreset, renamePreset, toPreset, validateName, type CustomPreset } from './presetStore'

const recipe = recipeFrom({ ...DEFAULT_SETTINGS, format: 'jpeg', quality: 70, width: 800, height: 600 })
const make = (n: number): CustomPreset[] =>
  Array.from({ length: n }, (_, i) => ({ id: `custom-${i}`, name: `Preset ${i}`, createdAt: '2026-01-01', recipe }))

suite('recipeFrom', () => {
  it('keeps the recipe but not per-batch details (prefix, start index)', () => {
    const r = recipeFrom({ ...DEFAULT_SETTINGS, prefix: 'summer', startIndex: 42 })
    expect(r).not.toHaveProperty('prefix')
    expect(r).not.toHaveProperty('startIndex')
    expect(r).not.toHaveProperty('presetId')
    expect(r.pattern).toBe(DEFAULT_SETTINGS.pattern)
  })
})

suite('adding presets', () => {
  it('adds a trimmed, named preset', () => {
    const r = addPreset([], '  Blog hero  ', recipe, 'custom-a', 't')
    expect(r.error).toBeNull()
    expect(r.list).toEqual([{ id: 'custom-a', name: 'Blog hero', createdAt: 't', recipe }])
  })
  it.each([['', 'name'], ['   ', 'name'], ['x'.repeat(NAME_MAX + 1), 'at most']])('rejects %j', (name, hint) => {
    expect(addPreset([], name, recipe, 'custom-a', 't').error).toContain(hint)
  })
  it('rejects duplicates, ignoring case and spaces, and names of built-in presets', () => {
    const list = make(1)
    expect(validateName('preset 0', list)).toMatch(/already exists/)
    expect(validateName(' PRESET 0 ', list)).toMatch(/already exists/)
    expect(validateName('web banner', [])).toMatch(/already exists/)
    expect(validateName('Preset 1', list)).toBeNull()
  })
  it(`stops at ${MAX_CUSTOM_PRESETS} presets`, () => {
    const full = make(MAX_CUSTOM_PRESETS)
    const r = addPreset(full, 'One more', recipe, 'custom-x', 't')
    expect(r.error).toMatch(/up to 10/)
    expect(r.list).toBe(full)
  })
})

suite('renaming and removing', () => {
  it('renames, allowing the preset to keep its own name', () => {
    const list = make(2)
    expect(renamePreset(list, 'custom-0', 'Preset 0').error).toBeNull()
    expect(renamePreset(list, 'custom-0', 'Preset 1').error).toMatch(/already exists/)
    expect(renamePreset(list, 'custom-0', 'Renamed').list[0].name).toBe('Renamed')
  })
  it('removes by id', () => {
    expect(removePreset(make(3), 'custom-1').map((p) => p.id)).toEqual(['custom-0', 'custom-2'])
  })
})

suite('reading localStorage (untrusted)', () => {
  const good = JSON.stringify(make(2))
  it('round-trips valid data', () => expect(parseStored(good)).toEqual(make(2)))
  it.each([[null], [''], ['{ not json'], ['{}'], ['"text"'], ['null'], ['42']])('survives %j', (raw) => expect(parseStored(raw)).toEqual([]))
  it('drops entries with the wrong shape but keeps the good ones', () => {
    const bad = [
      { id: 'custom-ok', name: 'Fine', createdAt: 'x', recipe },
      { id: 'no-prefix', name: 'Bad id', createdAt: 'x', recipe },
      { id: 'custom-1', name: '', createdAt: 'x', recipe },
      { id: 'custom-2', name: 'x'.repeat(31), createdAt: 'x', recipe },
      { id: 'custom-3', name: 'Bad format', createdAt: 'x', recipe: { ...recipe, format: 'avif' } },
      { id: 'custom-4', name: 'Bad quality', createdAt: 'x', recipe: { ...recipe, quality: 500 } },
      { id: 'custom-5', name: 'Bad width', createdAt: 'x', recipe: { ...recipe, width: -3 } },
      { id: 'custom-6', name: 'Bad colour', createdAt: 'x', recipe: { ...recipe, background: 'url(javascript:alert(1))' } },
      { id: 'custom-7', name: 'No recipe', createdAt: 'x' },
      'string', null, 7,
    ]
    expect(parseStored(JSON.stringify(bad)).map((p) => p.id)).toEqual(['custom-ok'])
  })
  it('drops duplicate ids and caps the list', () => {
    expect(parseStored(JSON.stringify([...make(2), ...make(2)]))).toHaveLength(2)
    expect(parseStored(JSON.stringify(make(50)))).toHaveLength(MAX_CUSTOM_PRESETS)
  })
  it('does not carry unknown fields through', () => {
    const polluted = [{ id: 'custom-a', name: 'A', createdAt: 'x', evil: 1, recipe: { ...recipe, __proto__: { x: 1 }, extra: 'y' } }]
    const [p] = parseStored(JSON.stringify(polluted))
    expect(p).not.toHaveProperty('evil')
    expect(p.recipe).not.toHaveProperty('extra')
  })
})

suite('using a preset', () => {
  it('toPreset exposes the whole recipe and marks it custom', () => {
    const p = toPreset(make(1)[0])
    expect(p).toMatchObject({ id: 'custom-0', label: 'Preset 0', custom: true, format: 'jpeg', quality: 70, width: 800, pattern: recipe.pattern })
  })
  it('describe gives a readable one-liner', () => {
    expect(describe(recipe)).toBe('800×600 · Fit · JPEG Q70')
    expect(describe({ ...recipe, resizeMode: 'original', format: 'png' })).toBe('Original size · Original · PNG')
    expect(describe({ ...recipe, resizeMode: 'width', format: 'webp', quality: 80 })).toBe('Width 800 · Width · WebP Q80')
  })
})
