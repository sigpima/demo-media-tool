import { describe, expect, it } from 'vitest'
import { formatBytes, setFormatLocale } from './format'

describe('formatBytes', () => {
  it('uses the decimal separator of the active language', () => {
    setFormatLocale('en')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
    setFormatLocale('vi')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 MB')
    setFormatLocale('en')
  })
  it('shows whole KB below 1 MB, at least 1 KB', () => {
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(10)).toBe('1 KB')
  })
})
