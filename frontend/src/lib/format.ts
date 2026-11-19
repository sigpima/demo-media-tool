export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export const formatDims = (w: number, h: number) => `${w}×${h}`

/** Positive number = smaller. */
export function percentSaved(original: number, output: number): number {
  if (original <= 0) return 0
  return Math.round(((original - output) / original) * 100)
}

export const extFor = (format: string) => (format === 'jpeg' ? 'jpg' : format)
export const labelFor = (format: string) => (format === 'jpeg' ? 'JPEG' : format.toUpperCase())

/** "−87%" when the output is smaller, "+21%" when it grew (already-small files can get bigger). */
export function formatSaving(original: number, output: number): { text: string; smaller: boolean } {
  const pct = percentSaved(original, output)
  return pct >= 0 ? { text: `−${pct}%`, smaller: true } : { text: `+${-pct}%`, smaller: false }
}
