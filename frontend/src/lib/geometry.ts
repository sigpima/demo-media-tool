import type { Settings } from '../types'

/**
 * Output size for an image. Never distorts: aspect ratio is always preserved
 * (fit/width) or cropped (cover). Mirrors what the backend (Pillow) will do.
 *   fit      3024×4032 → 1080×1080 box => 810×1080
 *   cover    3024×4032 → 1080×1080     => 1080×1080 (centre crop)
 *   width    width = W, height computed
 *   original keeps the size
 */
export function outputSize(w: number, h: number, s: Pick<Settings, 'resizeMode' | 'width' | 'height'>): [number, number] {
  switch (s.resizeMode) {
    case 'original':
      return [w, h]
    case 'width':
      return [s.width, Math.max(1, Math.round((h * s.width) / w))]
    case 'cover':
      return [s.width, s.height]
    case 'fit':
    default: {
      const scale = Math.min(s.width / w, s.height / h)
      return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))]
    }
  }
}
