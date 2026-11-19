import { describe as suite, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, PRESETS } from './constants'
import { addPreset, isModified, isPresetsStorageEvent, MAX_CUSTOM_PRESETS, NAME_MAX, parseStored, presetSummary, recipeFrom, removePreset, renamePreset, toPreset, updatePreset, validateName, type CustomPreset } from './presetStore'

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
  it.each([['', 'name-empty'], ['   ', 'name-empty'], ['x'.repeat(NAME_MAX + 1), 'name-long']])('rejects %j with code %s', (name, code) => {
    expect(addPreset([], name, recipe, 'custom-a', 't').error).toBe(code)
  })
  it('rejects duplicates, ignoring case and spaces, and names of built-in presets', () => {
    const list = make(1)
    expect(validateName('preset 0', list)).toBe('name-taken')
    expect(validateName(' PRESET 0 ', list)).toBe('name-taken')
    expect(validateName('web banner', [])).toBe('name-taken')
    expect(validateName('Preset 1', list)).toBeNull()
  })
  it(`stops at ${MAX_CUSTOM_PRESETS} presets`, () => {
    const full = make(MAX_CUSTOM_PRESETS)
    const r = addPreset(full, 'One more', recipe, 'custom-x', 't')
    expect(r.error).toBe('limit')
    expect(r.list).toBe(full)
  })
})

suite('renaming and removing', () => {
  it('renames, allowing the preset to keep its own name', () => {
    const list = make(2)
    expect(renamePreset(list, 'custom-0', 'Preset 0').error).toBeNull()
    expect(renamePreset(list, 'custom-0', 'Preset 1').error).toBe('name-taken')
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
})

suite('updating a preset', () => {
  const next = { ...recipe, quality: 55, format: 'webp' as const }
  it('replaces the recipe but keeps id, name and createdAt', () => {
    const [a, b] = updatePreset(make(2), 'custom-1', next)
    expect(a).toEqual(make(2)[0])
    expect(b).toEqual({ id: 'custom-1', name: 'Preset 1', createdAt: '2026-01-01', recipe: next })
  })
  it('leaves the list alone for an unknown id', () => expect(updatePreset(make(2), 'custom-nope', next)).toEqual(make(2)))
})

suite('isModified', () => {
  const custom = toPreset(make(1)[0]) // jpeg q70 800x600, full recipe
  const same = { ...DEFAULT_SETTINGS, ...recipe, presetId: 'custom-0' }
  const builtIn = PRESETS[0]
  const onBuiltIn = { ...DEFAULT_SETTINGS, width: builtIn.width, height: builtIn.height, format: builtIn.format, quality: builtIn.quality, presetId: builtIn.id }
  it('is false when the settings equal the preset', () => {
    expect(isModified(same, custom)).toBe(false)
    expect(isModified(onBuiltIn, builtIn)).toBe(false)
  })
  it('is true when size, format or quality differ', () => {
    expect(isModified({ ...same, quality: 71 }, custom)).toBe(true)
    expect(isModified({ ...same, width: 801 }, custom)).toBe(true)
    expect(isModified({ ...onBuiltIn, format: 'png' }, builtIn)).toBe(true)
  })
  it('checks the extra recipe fields only for presets that carry them', () => {
    expect(isModified({ ...same, pattern: '{index}' }, custom)).toBe(true)
    expect(isModified({ ...same, removeMetadata: !same.removeMetadata }, custom)).toBe(true)
    expect(isModified({ ...onBuiltIn, resizeMode: 'cover', pattern: 'x', padding: 5, removeMetadata: false, background: '#000000' }, builtIn)).toBe(false)
  })
  it('does not throw for a preset that lacks optional fields', () => {
    expect(() => isModified(onBuiltIn, { id: 'p', label: 'P', width: 1, height: 1, format: 'webp', quality: 80 })).not.toThrow()
  })
})

suite('presetSummary', () => {
  const base = { width: 1600, height: 900, format: 'webp' as const, quality: 80 }
  it('shows size, format and quality', () => expect(presetSummary(base, 'Original size')).toBe('1600×900 · WEBP · Q80'))
  it('omits quality for PNG', () => expect(presetSummary({ ...base, format: 'png' }, 'Original size')).toBe('1600×900 · PNG'))
  it('uses the given label for Original mode', () => expect(presetSummary({ ...base, resizeMode: 'original', format: 'jpeg' }, 'Giữ nguyên')).toBe('Giữ nguyên · JPEG · Q80'))
  it('shows just the width for Width mode', () => expect(presetSummary({ ...base, resizeMode: 'width' }, 'x')).toBe('1600px · WEBP · Q80'))
})

suite('isPresetsStorageEvent', () => {
  it('reacts to the presets key and to localStorage.clear() (key null), not to other keys', () => {
    expect(isPresetsStorageEvent('cbt.presets.v1')).toBe(true)
    expect(isPresetsStorageEvent(null)).toBe(true)
    expect(isPresetsStorageEvent('cbt.lang')).toBe(false)
  })
})
