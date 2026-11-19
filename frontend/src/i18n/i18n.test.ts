import { describe, expect, it } from 'vitest'
import { en } from './en'
import { detectLang, format, translate } from './index'
import { vi as viDict } from './vi'

describe('detectLang', () => {
  it.each([
    [null, 'vi-VN', 'vi'],
    [null, 'en-US', 'en'],
    [null, undefined, 'en'],
    ['en', 'vi-VN', 'en'],
    ['vi', 'en-US', 'vi'],
    ['xx', 'vi-VN', 'vi'], // hand-edited storage value falls back to detection
    ['', 'en-GB', 'en'],
  ])('saved=%s navigator=%s -> %s', (saved, nav, expected) => {
    expect(detectLang(saved, nav)).toBe(expected)
  })
})

describe('format', () => {
  it('substitutes params', () => expect(format('Hi {name}, {n}', { name: 'A', n: 3 })).toBe('Hi A, 3'))
  it('leaves unknown placeholders as they are', () => expect(format('{x}')).toBe('{x}'))
  it('does not substitute inside substituted values', () => expect(format('{a} {b}', { a: '{b}', b: 'z' })).toBe('{b} z'))
})

describe('translate plurals', () => {
  it('uses _one for 1 and _other for more in English', () => {
    expect(translate('en', 'guest.days', { count: 1 })).toBe('expires in 1 day')
    expect(translate('en', 'guest.days', { count: 2 })).toBe('expires in 2 days')
  })
  it('uses the _other form for every count in Vietnamese', () => {
    expect(translate('vi', 'guest.days', { count: 1 })).toBe(viDict['guest.days_other'].replace('{count}', '1'))
  })
})

describe('dictionaries', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  it('vi has exactly the keys of en', () => expect(Object.keys(viDict).sort()).toEqual(Object.keys(en).sort()))
  it('no empty values', () => {
    for (const [k, v] of Object.entries({ ...en, ...viDict })) expect(v.trim(), k).not.toBe('')
  })
  it('placeholders match between languages', () => {
    for (const k of Object.keys(en) as Array<keyof typeof en>) expect(placeholders(viDict[k]), k).toEqual(placeholders(en[k]))
  })
})
