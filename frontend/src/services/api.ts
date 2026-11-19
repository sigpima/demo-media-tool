/** Client for the FastAPI backend (see backend/app/routes/batches.py). Same-origin: the Vite dev server proxies /api. */
import type { Settings } from '../types'

export interface ApiAsset {
  id: string
  name: string
  format: 'jpeg' | 'png' | 'webp'
  size: number
  width: number
  height: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  slot?: number | null
  error?: string | null
  outName?: string | null
  outSize?: number | null
  outWidth?: number | null
  outHeight?: number | null
  outFormat?: 'jpeg' | 'png' | 'webp' | null
  outQuality?: number | null
}

export interface ApiBatch {
  id: string
  status: 'idle' | 'processing'
  assets: ApiAsset[]
}

export interface UploadResult {
  name: string
  asset: ApiAsset | null
  error: string | null
}

export interface ApiConfig {
  role: 'admin' | 'guest'
  maxFileMb: number
  maxFilesPerBatch: number
  maxPixels: number
  ttlHours: number
  concurrency: number
  acceptedMime: string[]
  imagesLeftToday: number | null
  inviteExpiresAt: string | null
}

/** `code` is set only when the message was generated here (so the UI can translate it); server text has no code. */
export type ApiErrorCode = 'network' | 'expired' | 'invalid' | 'failed' | 'upload'

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: ApiErrorCode) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Cannot reach the server.', 'network')
  }
  if (!res.ok) {
    let detail = res.status === 401 ? 'Your access has expired. Open your invite link again.' : `Request failed (${res.status})`
    let code: ApiErrorCode | undefined = res.status === 401 ? 'expired' : 'failed'
    try {
      const body = (await res.json()).detail
      if (body != null) {
        detail = body
        code = undefined // the server's own text
      }
    } catch {
      /* not JSON */
    }
    if (typeof detail !== 'string') throw new ApiError(res.status, 'Invalid request.', 'invalid')
    throw new ApiError(res.status, detail, code)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const getConfig = () => request<ApiConfig>('/api/config')
export const createBatch = () => request<ApiBatch>('/api/batches', { method: 'POST' })
export const getStatus = (batchId: string, signal?: AbortSignal) => request<ApiBatch>(`/api/batches/${batchId}/status`, { signal })

export const startProcessing = (batchId: string, assetIds: string[], settings: Settings, reset: boolean) =>
  request<ApiBatch>(`/api/batches/${batchId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetIds, settings, reset }),
  })

export const deleteAsset = (batchId: string, assetId: string) => request<void>(`/api/batches/${batchId}/assets/${assetId}`, { method: 'DELETE' })
export const deleteBatch = (batchId: string) => fetch(`/api/batches/${batchId}`, { method: 'DELETE', keepalive: true }).catch(() => undefined)

export const outputUrl = (batchId: string, assetId: string, version: string | number) => `/api/batches/${batchId}/assets/${assetId}/output?v=${version}`
export const downloadUrl = (batchId: string, assetId: string) => `/api/batches/${batchId}/assets/${assetId}/download`
export const exportUrl = (batchId: string) => `/api/batches/${batchId}/export`

/** Plain link click: the browser saves the file and keeps using the Basic-auth credentials it already has. */
export function triggerDownload(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.append(a)
  a.click()
  a.remove()
}

/** Uploads one file with real progress (fetch cannot report upload progress, XHR can). */
export function uploadFile(batchId: string, file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/batches/${batchId}/assets`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText)
        if (xhr.status === 200) return resolve(body.results[0] as UploadResult)
        reject(typeof body.detail === 'string' ? new ApiError(xhr.status, body.detail) : new ApiError(xhr.status, `Upload failed (${xhr.status})`, 'upload'))
      } catch {
        reject(new ApiError(xhr.status, `Upload failed (${xhr.status})`, 'upload'))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Cannot reach the server.', 'network'))
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    const form = new FormData()
    form.append('files', file, file.name)
    xhr.send(form)
  })
}
