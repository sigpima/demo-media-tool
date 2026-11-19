import type { Asset, Settings } from '../types'
import { outputSize } from './geometry'

/** Rough size estimate for the settings preview. The UI must always label it "estimated" — exact sizes come from the server. */
export function estimateOutputSize(a: Pick<Asset, 'size' | 'width' | 'height'>, s: Settings): number {
  const [w, h] = outputSize(a.width, a.height, s)
  const pixelRatio = Math.min(1, (w * h) / (a.width * a.height))
  const base = { webp: 0.3, jpeg: 0.45, png: 0.9 }[s.format]
  const quality = s.format === 'png' ? 1 : 0.35 + (0.65 * s.quality) / 100
  return Math.max(4096, Math.round(a.size * pixelRatio * base * quality))
}
