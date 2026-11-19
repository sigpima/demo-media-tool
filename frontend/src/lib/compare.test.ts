import { describe, expect, it } from 'vitest'
import { clampPct, frameStyle, nextPct, pctFromPointer } from './compare'

describe('clampPct', () => {
  it('clamps to 0..100', () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(130)).toBe(100)
    expect(clampPct(42)).toBe(42)
  })
  it('falls back to the middle for NaN', () => expect(clampPct(NaN)).toBe(50))
})

describe('pctFromPointer', () => {
  const rect = { left: 100, width: 200 }
  it('maps the pointer position inside the frame', () => expect(pctFromPointer(150, rect)).toBe(25))
  it('clamps outside the frame', () => {
    expect(pctFromPointer(50, rect)).toBe(0)
    expect(pctFromPointer(900, rect)).toBe(100)
  })
  it('does not divide by zero', () => expect(pctFromPointer(1, { left: 0, width: 0 })).toBe(50))
})

describe('nextPct', () => {
  it('steps by 5, or 20 with Shift', () => {
    expect(nextPct(50, 'ArrowRight', false)).toBe(55)
    expect(nextPct(50, 'ArrowUp', false)).toBe(55)
    expect(nextPct(50, 'ArrowLeft', true)).toBe(30)
    expect(nextPct(50, 'ArrowDown', false)).toBe(45)
  })
  it('stays inside 0..100', () => {
    expect(nextPct(98, 'ArrowRight', false)).toBe(100)
    expect(nextPct(3, 'ArrowLeft', false)).toBe(0)
  })
  it('jumps with Home / End', () => {
    expect(nextPct(50, 'Home', false)).toBe(0)
    expect(nextPct(50, 'End', false)).toBe(100)
  })
  it('ignores other keys', () => expect(nextPct(50, 'a', false)).toBeNull())
})

describe('frameStyle', () => {
  it('uses the output aspect ratio and caps the height at 70vh', () => {
    expect(frameStyle(1600, 900)).toEqual({ aspectRatio: '1600 / 900', width: 'min(100%, calc(70vh * 1.7778))' })
  })
  it('handles a wide panorama and a tall image', () => {
    expect(frameStyle(4000, 1000).width).toBe('min(100%, calc(70vh * 4.0000))')
    expect(frameStyle(1000, 4000)).toEqual({ aspectRatio: '1000 / 4000', width: 'min(100%, calc(70vh * 0.2500))' })
  })
  it('falls back to 16:9 for missing or invalid dimensions', () => {
    expect(frameStyle(0, 0).aspectRatio).toBe('16 / 9')
    expect(frameStyle(NaN, 100).aspectRatio).toBe('16 / 9')
    expect(frameStyle(-1, 5).width).toBe('min(100%, calc(70vh * 1.7778))')
  })
})
