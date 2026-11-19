import { useCallback, useEffect, useMemo, useState } from 'react'
import { MAX_FILES, MAX_FILE_BYTES } from '../lib/constants'
import type { Limits } from '../lib/limits'
import * as api from '../services/api'

/** Limits come from the server (guests have smaller ones). Falls back to the defaults if the API is unreachable (e.g. demo mode). */
export function useConfig() {
  const [config, setConfig] = useState<api.ApiConfig | null>(null)
  const refresh = useCallback(() => api.getConfig().then(setConfig).catch(() => undefined), [])
  useEffect(() => void refresh(), [refresh])
  const limits = useMemo<Limits>(
    () => (config ? { maxFiles: config.maxFilesPerBatch, maxFileBytes: config.maxFileMb * 1024 * 1024 } : { maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES }),
    [config],
  )
  return { config, limits, refresh }
}
