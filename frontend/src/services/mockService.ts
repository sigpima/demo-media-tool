/**
 * Simulated backend. Everything the UI needs from the server lives behind these functions,
 * so replacing this file with real calls to the FastAPI API (POST /api/batches, …/process,
 * …/status, …/export) does not touch any component.
 *
 * NOTE: sizes produced here are simulated. The real backend returns exact sizes from a real encode.
 */
import type { TFn } from '../i18n'
import { ACCEPTED_MIME, CONCURRENCY } from '../lib/constants'
import type { Limits } from '../lib/limits'
import { estimateOutputSize } from '../lib/estimate'
import { outputSize } from '../lib/geometry'
import { resolveNames } from '../lib/naming'
import type { Asset, Settings, SourceFormat } from '../types'

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('aborted', 'AbortError'))), { once: true })
  })

const FORMAT_FROM_MIME: Record<string, SourceFormat> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))

export interface RejectedFile {
  name: string
  reason: string
}

/**
 * Client-side validation + local previews, so the UI reacts instantly (the server validates again by decoding the
 * file). Dimensions are unknown here (0) — the server reports them after the upload.
 */
export function prepareFiles(files: File[], alreadyHave: number, limits: Limits, t: TFn): { assets: Array<{ asset: Asset; file: File }>; rejected: RejectedFile[] } {
  const assets: Array<{ asset: Asset; file: File }> = []
  const rejected: RejectedFile[] = []
  for (const file of files) {
    if (alreadyHave + assets.length >= limits.maxFiles) rejected.push({ name: file.name, reason: t('upload.limitFiles', { max: limits.maxFiles }) })
    else if (!ACCEPTED_MIME.includes(file.type)) rejected.push({ name: file.name, reason: t('upload.onlyTypes') })
    else if (file.size > limits.maxFileBytes) rejected.push({ name: file.name, reason: t('upload.tooLarge', { mb: Math.round(limits.maxFileBytes / 1024 / 1024) }) })
    else
      assets.push({
        file,
        asset: {
          id: `local-${newId()}`, name: file.name, format: FORMAT_FROM_MIME[file.type], size: file.size, width: 0, height: 0,
          previewUrl: URL.createObjectURL(file), selected: true, uploadProgress: 0, status: 'pending', inBatch: false,
        },
      })
  }
  return { assets, rejected }
}

/** Run the batch with a bounded number of concurrent "slots", isolating failures per asset. */
export async function runProcessing(opts: {
  assets: Asset[]
  settings: Settings
  onUpdate: (id: string, patch: Partial<Asset>) => void
  signal: AbortSignal
}): Promise<void> {
  const { assets, settings, onUpdate, signal } = opts
  const names = resolveNames(assets, settings)
  const queue = assets.filter((a) => a.status === 'pending')

  const worker = async (slot: number) => {
    for (;;) {
      const a = queue.shift()
      if (!a) return
      onUpdate(a.id, { status: 'processing', slot, error: undefined })
      try {
        await sleep(700 + Math.random() * 900, signal)
        if (a.demoFail) throw new Error(a.demoFail)
        const [w, h] = outputSize(a.width, a.height, settings)
        const jitter = 0.92 + Math.random() * 0.14
        onUpdate(a.id, {
          status: 'completed', slot: undefined, error: undefined, outName: names.get(a.id),
          outSize: Math.round(estimateOutputSize(a, settings) * jitter), outWidth: w, outHeight: h,
          outFormat: settings.format, outQuality: settings.format === 'png' ? undefined : settings.quality,
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        onUpdate(a.id, { status: 'failed', slot: undefined, error: (err as Error).message })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)))
}

/* ------------------------------ demo data (dev only) ------------------------------ */

const SAMPLES: Array<[name: string, w: number, h: number, mb: number, fmt: SourceFormat]> = [
  ['sneaker-red-front.jpg', 3024, 4032, 3.8, 'jpeg'], ['sneaker-red-side.jpg', 4032, 3024, 4.1, 'jpeg'],
  ['backpack-olive.png', 2400, 2400, 6.2, 'png'], ['backpack-detail-zip.jpg', 3024, 4032, 3.5, 'jpeg'],
  ['campaign-hero-wide.jpg', 5120, 2880, 7.5, 'jpeg'], ['mug-white-logo.webp', 1800, 1800, 0.9, 'webp'],
  ['hoodie-grey-back.jpg', 3024, 4032, 3.9, 'jpeg'], ['cap-navy.png', 2000, 1500, 3.1, 'png'],
  ['lamp-brass-01.jpg', 3500, 2333, 4.4, 'jpeg'], ['lamp-brass-02.jpg', 3500, 2333, 4.2, 'jpeg'],
  ['bottle-steel.webp', 1600, 2400, 0.7, 'webp'], ['tote-natural.jpg', 3024, 3024, 3.3, 'jpeg'],
]

const DEMO_FAILURES: Record<number, string> = {
  3: 'Cannot decode image — the file appears to be corrupted.',
  8: 'Image exceeds the 100 megapixel limit.',
}

export function sampleAssets(): Asset[] {
  return SAMPLES.map(([name, width, height, mb, format], i) => ({
    id: `sample-${i}`, name, format, width, height, size: Math.round(mb * 1024 * 1024),
    previewUrl: `/samples/thumb-${String(i).padStart(2, '0')}.jpg`, selected: true, uploadProgress: 100,
    status: 'pending' as const, inBatch: false, demoFail: DEMO_FAILURES[i],
  }))
}
