export type SourceFormat = 'jpeg' | 'png' | 'webp'
export type OutputFormat = 'webp' | 'jpeg' | 'png'
export type ResizeMode = 'fit' | 'cover' | 'width' | 'original'
export type AssetStatus = 'pending' | 'processing' | 'completed' | 'failed'

/** What the UI shows. Derived from assets + `mode`, see state/useBatch.ts. */
export type Phase = 'empty' | 'uploading' | 'ready' | 'processing' | 'completed' | 'partial' | 'failed'

export interface Asset {
  id: string
  name: string
  format: SourceFormat
  size: number // bytes
  width: number
  height: number
  previewUrl: string
  /** URL of the processed file on the server (absent in demo mode) */
  outputUrl?: string
  selected: boolean
  uploadProgress: number // 0..100
  status: AssetStatus
  inBatch: boolean // part of the current/last processing run
  slot?: number // 1..CONCURRENCY while processing
  error?: string
  outName?: string
  outSize?: number // bytes — exact only when it comes from a real encode
  outWidth?: number
  outHeight?: number
  outFormat?: OutputFormat
  outQuality?: number
  /** demo only: fail this asset on the first run with this message */
  demoFail?: string
}

export interface Settings {
  presetId: string | null
  resizeMode: ResizeMode
  width: number
  height: number
  format: OutputFormat
  quality: number // 1..100 (lossy formats)
  background: string // used when flattening transparency into JPEG
  removeMetadata: boolean
  prefix: string
  pattern: string
  padding: number
  startIndex: number
}

export interface Preset {
  id: string
  label: string
  width: number
  height: number
  format: OutputFormat
  quality: number
}

export interface Toast {
  id: number
  message: string
}
