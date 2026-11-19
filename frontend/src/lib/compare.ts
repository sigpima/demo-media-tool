/** Pure maths for the before/after slider (percent = how much of the frame shows the original, from the left). */

export const clampPct = (n: number): number => (Number.isNaN(n) ? 50 : Math.min(100, Math.max(0, n)))

export function pctFromPointer(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 50
  return clampPct(((clientX - rect.left) / rect.width) * 100)
}

/** New position for a key press, or null when the key is not one the slider handles. */
export function nextPct(current: number, key: string, shift: boolean): number | null {
  const step = shift ? 20 : 5
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clampPct(current + step)
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampPct(current - step)
    case 'Home':
      return 0
    case 'End':
      return 100
    default:
      return null
  }
}

/** Frame that has the output's aspect ratio but never grows taller than 70vh. Bad dimensions fall back to 16:9. */
export function frameStyle(w: number, h: number): { aspectRatio: string; width: string } {
  const ok = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
  const [fw, fh] = ok ? [w, h] : [16, 9]
  return { aspectRatio: `${fw} / ${fh}`, width: `min(100%, calc(70vh * ${(fw / fh).toFixed(4)}))` }
}
