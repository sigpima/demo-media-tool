import type { Preset, Settings } from '../types'

/** Mirrors the backend limits (to be enforced server-side as well — never trust the client). */
export const MAX_FILES = 100
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const CONCURRENCY = 3 // matches the server-side worker limit
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp']
export const FILE_TTL_HOURS = 24

export const PRESETS: Preset[] = [
  { id: 'social-square', label: 'Social Square', width: 1080, height: 1080, format: 'webp', quality: 80 },
  { id: 'instagram-portrait', label: 'Instagram Portrait', width: 1080, height: 1350, format: 'jpeg', quality: 85 },
  { id: 'web-banner', label: 'Web Banner', width: 1920, height: 1080, format: 'webp', quality: 80 },
  { id: 'product-catalog', label: 'Product Catalog', width: 1200, height: 1200, format: 'jpeg', quality: 90 },
]

export const DEFAULT_SETTINGS: Settings = {
  presetId: 'web-banner',
  resizeMode: 'fit',
  width: 1920,
  height: 1080,
  format: 'webp',
  quality: 80,
  background: '#ffffff',
  removeMetadata: true,
  prefix: 'campaign',
  pattern: '{prefix}_{index}',
  padding: 3,
  startIndex: 1,
}

export const NAMING_TOKENS = ['{prefix}', '{index}', '{name}', '{date}', '{w}', '{h}'] as const
