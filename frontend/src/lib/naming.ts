import type { Asset, Settings } from '../types'
import { extFor } from './format'
import { outputSize } from './geometry'

/** Keep it filesystem-safe. The server must sanitize again — this is for preview only. */
export function sanitize(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 120)
}

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')

export function buildName(asset: Asset, position: number, s: Settings): string {
  const [w, h] = outputSize(asset.width, asset.height, s)
  const base = asset.name.replace(/\.[^.]+$/, '')
  const index = String(s.startIndex + position).padStart(s.padding, '0')
  const raw = s.pattern
    .replaceAll('{prefix}', s.prefix)
    .replaceAll('{index}', index)
    .replaceAll('{name}', base)
    .replaceAll('{date}', today())
    .replaceAll('{w}', String(w))
    .replaceAll('{h}', String(h))
  return `${sanitize(raw) || 'image'}.${extFor(s.format)}`
}

/** Names for a list of assets, made unique (a.webp, a_2.webp…) after the extension change. */
export function resolveNames(assets: Asset[], s: Settings): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()
  assets.forEach((a, i) => {
    const first = buildName(a, i, s)
    const dot = first.lastIndexOf('.')
    const [stem, ext] = [first.slice(0, dot), first.slice(dot)]
    let name = first
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem}_${n}${ext}`
    used.add(name.toLowerCase())
    out.set(a.id, name)
  })
  return out
}
