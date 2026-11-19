import { useCallback, useEffect, useState } from 'react'
import { addPreset, parseStored, removePreset, renamePreset, STORAGE_KEY, updatePreset, type CustomPreset, type PresetRecipe, type Result } from '../lib/presetStore'

const newId = () => `custom-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`

function read(): CustomPreset[] {
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY))
  } catch {
    return [] // storage blocked (private mode, disabled cookies)
  }
}

/** Custom presets, persisted in this browser and kept in sync between tabs. */
export function usePresets() {
  const [list, setList] = useState<CustomPreset[]>(read)

  const commit = useCallback((next: CustomPreset[]) => {
    setList(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage full or blocked: presets still work for this session */
    }
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && setList(read())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const apply = (r: Result): Result => {
    if (r.error === null) commit(r.list)
    return r
  }
  return {
    list,
    add: (name: string, recipe: PresetRecipe) => apply(addPreset(list, name, recipe, newId(), new Date().toISOString())),
    rename: (id: string, name: string) => apply(renamePreset(list, id, name)),
    update: (id: string, recipe: PresetRecipe) => commit(updatePreset(list, id, recipe)),
    remove: (id: string) => commit(removePreset(list, id)),
  }
}

export type Presets = ReturnType<typeof usePresets>
