import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '../lib/constants'
import type { Limits } from '../lib/limits'
import { estimateOutputSize } from '../lib/estimate'
import { outputSize } from '../lib/geometry'
import { resolveNames } from '../lib/naming'
import * as api from '../services/api'
import { prepareFiles, runProcessing, sampleAssets } from '../services/mockService'
import type { Asset, Phase, Preset, Settings, Toast } from '../types'

type Mode = 'idle' | 'uploading' | 'processing' | 'failed'

const UPLOAD_PARALLELISM = 3
const POLL_MS = 600
const isLocal = (a: Asset) => a.id.startsWith('local-')
const isDemo = (assets: Asset[]) => assets.some((a) => a.id.startsWith('sample-'))
const revoke = (a: Asset) => a.previewUrl.startsWith('blob:') && URL.revokeObjectURL(a.previewUrl)
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('aborted', 'AbortError'))), { once: true })
  })
const aborted = (e: unknown) => (e as Error)?.name === 'AbortError'

/** The UI phase is derived from the data, so it can never disagree with what is on screen. */
export function derivePhase(mode: Mode, assets: Asset[]): Phase {
  if (mode !== 'idle') return mode
  if (assets.length === 0) return 'empty'
  const hasResults = assets.some((a) => a.inBatch && (a.status === 'completed' || a.status === 'failed'))
  const selectedPending = assets.some((a) => a.selected && a.status === 'pending')
  if (selectedPending || !hasResults) return 'ready'
  return assets.some((a) => a.inBatch && a.status === 'failed') ? 'partial' : 'completed'
}

export function useBatch(limits: Limits, onUploaded?: () => void) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [mode, setMode] = useState<Mode>('idle')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [inspectId, setInspectId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [announcement, setAnnouncement] = useState('')

  const assetsRef = useRef(assets)
  assetsRef.current = assets
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const batchIdRef = useRef<string | null>(null) // server-side batch (null until the first upload / in demo mode)
  const abortRef = useRef<AbortController | null>(null)
  const toastId = useRef(0)
  const limitsRef = useRef(limits)
  limitsRef.current = limits
  const onUploadedRef = useRef(onUploaded)
  onUploadedRef.current = onUploaded

  const phase = derivePhase(mode, assets)

  const notify = useCallback((message: string) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])

  const patch = useCallback((id: string, p: Partial<Asset>) => setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a))), [])
  const cancelWork = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])
  const dropServerBatch = useCallback(() => {
    if (batchIdRef.current) api.deleteBatch(batchIdRef.current)
    batchIdRef.current = null
  }, [])

  useEffect(() => {
    // Free server storage when the tab is closed (the server also expires idle batches by itself).
    const onHide = () => batchIdRef.current && api.deleteBatch(batchIdRef.current)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      abortRef.current?.abort()
    }
  }, [])

  /* ------------------------------ settings ------------------------------ */
  const updateSettings = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), [])
  const applyPreset = useCallback((p: Preset) => {
    setSettings((s) => ({
      ...s,
      presetId: p.id, width: p.width, height: p.height, format: p.format, quality: p.quality,
      // custom presets carry the whole recipe; built-in ones leave these as the user has them
      ...(p.resizeMode !== undefined && { resizeMode: p.resizeMode }),
      ...(p.background !== undefined && { background: p.background }),
      ...(p.removeMetadata !== undefined && { removeMetadata: p.removeMetadata }),
      ...(p.pattern !== undefined && { pattern: p.pattern }),
      ...(p.padding !== undefined && { padding: p.padding }),
    }))
  }, [])

  /* ------------------------------ upload ------------------------------ */
  const addFiles = useCallback(
    async (files: File[]) => {
      if (mode === 'processing' || mode === 'uploading' || files.length === 0) return
      if (isDemo(assetsRef.current)) {
        assetsRef.current.forEach(revoke)
        setAssets([])
        assetsRef.current = []
      }
      const { assets: prepared, rejected } = prepareFiles(files, assetsRef.current.length, limitsRef.current)
      const skipped = rejected.map((r) => `${r.name}: ${r.reason}`)
      if (!prepared.length) return skipped.length ? notify(skippedMessage(skipped)) : undefined

      const controller = new AbortController()
      abortRef.current = controller
      setAssets((prev) => [...prev, ...prepared.map((p) => p.asset)])
      setMode('uploading')

      const removeLocal = (id: string) =>
        setAssets((prev) => {
          prev.filter((a) => a.id === id).forEach(revoke)
          return prev.filter((a) => a.id !== id)
        })
      let uploaded = 0
      try {
        if (!batchIdRef.current) batchIdRef.current = (await api.createBatch()).id
        const batchId = batchIdRef.current
        let next = 0
        const worker = async () => {
          while (next < prepared.length) {
            const { asset, file } = prepared[next++]
            try {
              const res = await api.uploadFile(batchId, file, (pct) => patch(asset.id, { uploadProgress: pct }), controller.signal)
              if (res.asset) {
                const s = res.asset
                uploaded++
                setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, id: s.id, name: s.name, format: s.format, size: s.size, width: s.width, height: s.height, uploadProgress: 100 } : a)))
              } else {
                skipped.push(`${res.name}: ${res.error}`)
                removeLocal(asset.id)
              }
            } catch (e) {
              if (aborted(e)) throw e
              skipped.push(`${asset.name}: ${(e as Error).message}`)
              removeLocal(asset.id)
            }
          }
        }
        await Promise.all(Array.from({ length: UPLOAD_PARALLELISM }, worker))
      } catch (e) {
        if (aborted(e)) return
        skipped.push((e as Error).message)
        assetsRef.current.filter(isLocal).forEach((a) => removeLocal(a.id))
      }
      setMode('idle')
      onUploadedRef.current?.() // e.g. refresh "images left today"
      if (skipped.length) notify(skippedMessage(skipped))
      if (uploaded) setAnnouncement(`${uploaded} image${uploaded > 1 ? 's' : ''} uploaded`)
    },
    [mode, notify, patch],
  )

  /* ------------------------------ processing ------------------------------ */
  const finishRun = useCallback(() => {
    setMode('idle')
    const failed = assetsRef.current.filter((a) => a.inBatch && a.status === 'failed').length
    setAnnouncement(failed ? `Processing finished. ${failed} failed.` : 'Processing finished. All images completed.')
  }, [])

  /** Demo mode: the simulated worker pool in services/mockService.ts. */
  const runDemo = useCallback(
    async (batchAssets: Asset[]) => {
      cancelWork()
      const controller = new AbortController()
      abortRef.current = controller
      setMode('processing')
      setGlobalError(null)
      try {
        await runProcessing({ assets: batchAssets, settings: settingsRef.current, onUpdate: patch, signal: controller.signal })
        if (!controller.signal.aborted) finishRun()
      } catch (e) {
        if (!aborted(e)) {
          setGlobalError('The processing service stopped unexpectedly. Your files are still here.')
          setMode('failed')
        }
      }
    },
    [cancelWork, finishRun, patch],
  )

  /** Real mode: ask the server to process, then poll its status (it owns the truth about every file). */
  const runRemote = useCallback(
    async (ids: string[], reset: boolean) => {
      const batchId = batchIdRef.current
      if (!batchId) return
      cancelWork()
      const controller = new AbortController()
      abortRef.current = controller
      setMode('processing')
      setGlobalError(null)
      const merge = (st: api.ApiBatch) => {
        const byId = new Map(st.assets.map((s) => [s.id, s]))
        setAssets((prev) =>
          prev.map((a) => {
            const s = byId.get(a.id)
            if (!s) return a
            return {
              ...a, status: s.status, slot: s.slot ?? undefined, error: s.error ?? undefined, outName: s.outName ?? undefined,
              outSize: s.outSize ?? undefined, outWidth: s.outWidth ?? undefined, outHeight: s.outHeight ?? undefined,
              outFormat: s.outFormat ?? undefined, outQuality: s.outQuality ?? undefined,
              outputUrl: s.status === 'completed' ? api.outputUrl(batchId, a.id, `${s.outSize}-${s.outName}`) : undefined,
            }
          }),
        )
      }
      try {
        merge(await api.startProcessing(batchId, ids, settingsRef.current, reset))
        for (let misses = 0; ; ) {
          await sleep(POLL_MS, controller.signal)
          try {
            const st = await api.getStatus(batchId, controller.signal)
            misses = 0
            merge(st)
            if (st.status === 'idle') break
          } catch (e) {
            if (aborted(e) || (e instanceof api.ApiError && e.status === 404) || ++misses >= 5) throw e // brief network blips are tolerated
          }
        }
        finishRun()
      } catch (e) {
        if (aborted(e)) return
        const expired = e instanceof api.ApiError && e.status === 404
        setGlobalError(expired ? 'This batch has expired on the server. Please upload your images again.' : (e as Error).message || 'The processing service stopped unexpectedly.')
        setMode('failed')
      }
    },
    [cancelWork, finishRun],
  )

  const start = useCallback(
    (batchAssets: Asset[], reset: boolean) => (isDemo(batchAssets) ? runDemo(batchAssets) : runRemote(batchAssets.map((a) => a.id), reset)),
    [runDemo, runRemote],
  )

  const process = useCallback(() => {
    const marked = assetsRef.current.map((a) => (a.selected && a.status === 'pending' ? { ...a, inBatch: true } : a))
    if (!marked.some((a) => a.inBatch && a.status === 'pending')) return
    setAssets(marked)
    start(marked.filter((a) => a.inBatch), false)
  }, [start])

  const retry = useCallback(
    (ids: string[]) => {
      const set = new Set(ids)
      const marked = assetsRef.current.map((a) => (set.has(a.id) ? { ...a, status: 'pending' as const, error: undefined, demoFail: undefined, inBatch: true } : a))
      setAssets(marked)
      start(marked.filter((a) => a.inBatch), false)
    },
    [start],
  )
  const retryFailed = useCallback(() => retry(assetsRef.current.filter((a) => a.inBatch && a.status === 'failed').map((a) => a.id)), [retry])

  /** Re-run everything selected with the current settings (results are replaced). */
  const reprocess = useCallback(() => {
    const marked = assetsRef.current.map((a) =>
      a.selected ? { ...a, status: 'pending' as const, inBatch: true, error: undefined, outName: undefined, outSize: undefined, outWidth: undefined, outHeight: undefined, outputUrl: undefined } : a,
    )
    setAssets(marked)
    start(marked.filter((a) => a.inBatch), true)
  }, [start])

  /* ------------------------------ selection & removal ------------------------------ */
  const toggleSelect = useCallback((id: string) => setAssets((p) => p.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a))), [])
  const setAllSelected = useCallback((selected: boolean) => setAssets((p) => p.map((a) => ({ ...a, selected }))), [])
  const remove = useCallback(
    (id: string) => {
      const target = assetsRef.current.find((a) => a.id === id)
      if (target && !isLocal(target) && batchIdRef.current && !isDemo([target])) api.deleteAsset(batchIdRef.current, id).catch((e: Error) => notify(e.message))
      setAssets((p) => {
        p.filter((a) => a.id === id).forEach(revoke)
        return p.filter((a) => a.id !== id)
      })
      setInspectId((cur) => (cur === id ? null : cur))
    },
    [notify],
  )
  const clearAll = useCallback(() => {
    cancelWork()
    assetsRef.current.forEach(revoke)
    dropServerBatch()
    setAssets([])
    setMode('idle')
    setGlobalError(null)
    setInspectId(null)
  }, [cancelWork, dropServerBatch])

  /* ------------------------------ export & download ------------------------------ */
  const exportZip = useCallback(() => {
    const done = assetsRef.current.filter((a) => a.status === 'completed').length
    if (!batchIdRef.current || isDemo(assetsRef.current)) return notify(`Demo mode: would download a ZIP with ${done} processed files, manifest.json and processing_report.csv`)
    api.triggerDownload(api.exportUrl(batchIdRef.current))
  }, [notify])
  const download = useCallback(
    (id: string) => {
      const a = assetsRef.current.find((x) => x.id === id)
      if (!batchIdRef.current || !a || isDemo([a])) return notify(`Demo mode: would download ${a?.outName ?? 'file'}`)
      api.triggerDownload(api.downloadUrl(batchIdRef.current, id))
    },
    [notify],
  )

  /* ------------------------------ demo states (dev / ?demo only) ------------------------------ */
  const showDemo = useCallback(
    (target: Phase) => {
      cancelWork()
      assetsRef.current.forEach(revoke)
      dropServerBatch()
      setGlobalError(null)
      setInspectId(null)
      setMode('idle')
      const s = settingsRef.current
      const base = sampleAssets()
      const names = resolveNames(base, s)
      const done = (a: Asset): Asset => {
        const [w, h] = outputSize(a.width, a.height, s)
        return { ...a, inBatch: true, status: 'completed', outName: names.get(a.id), outSize: Math.round(estimateOutputSize(a, s) * 0.97), outWidth: w, outHeight: h, outFormat: s.format, outQuality: s.format === 'png' ? undefined : s.quality }
      }
      if (target === 'empty') return setAssets([])
      if (target === 'uploading') {
        setAssets(base.map((a, i) => ({ ...a, uploadProgress: i < 5 ? 100 : i < 8 ? 40 + i * 5 : 0 })))
        return setMode('uploading')
      }
      if (target === 'ready') return setAssets(base)
      if (target === 'completed') return setAssets(base.map((a) => done({ ...a, demoFail: undefined })))
      if (target === 'partial') return setAssets(base.map((a) => (a.demoFail ? { ...a, inBatch: true, status: 'failed' as const, error: a.demoFail } : done(a))))
      if (target === 'failed') {
        setAssets(base)
        setGlobalError('Could not reach the processing service. Your files are still here — nothing was lost.')
        return setMode('failed')
      }
      // processing: some already done, the rest runs through the simulated worker pool
      const marked = base.map((a, i) => (i < 4 ? done({ ...a, demoFail: undefined }) : { ...a, inBatch: true }))
      setAssets(marked)
      runDemo(marked)
    },
    [cancelWork, dropServerBatch, runDemo],
  )

  /* ------------------------------ derived ------------------------------ */
  const derived = useMemo(() => {
    const batch = assets.filter((a) => a.inBatch)
    const count = (st: Asset['status']) => batch.filter((a) => a.status === st).length
    const completed = batch.filter((a) => a.status === 'completed')
    const inspected = assets.find((a) => a.id === inspectId && a.status === 'completed') ?? assets.find((a) => a.status === 'completed' && a.inBatch)
    return {
      selectedCount: assets.filter((a) => a.selected).length,
      pendingSelected: assets.filter((a) => a.selected && a.status === 'pending').length,
      totalBytes: assets.reduce((n, a) => n + a.size, 0),
      stats: { total: batch.length, completed: count('completed'), processing: count('processing'), queued: count('pending'), failed: count('failed') },
      originalTotal: completed.reduce((n, a) => n + a.size, 0),
      outputTotal: completed.reduce((n, a) => n + (a.outSize ?? 0), 0),
      inspected,
    }
  }, [assets, inspectId])

  return {
    phase, assets, settings, globalError, toasts, announcement, ...derived,
    updateSettings, applyPreset, addFiles, process, retry, retryFailed, reprocess,
    toggleSelect, setAllSelected, remove, clearAll, exportZip, download, inspect: setInspectId, showDemo,
  }
}

function skippedMessage(skipped: string[]): string {
  const first = skipped.slice(0, 2).join(' · ')
  return `${skipped.length} file${skipped.length > 1 ? 's' : ''} skipped — ${first}${skipped.length > 2 ? ' …' : ''}`
}

export type Batch = ReturnType<typeof useBatch>
