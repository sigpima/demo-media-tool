import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, type Key } from './en'
import { vi } from './vi'

export type Lang = 'en' | 'vi'
export type { Key }
export type Params = Record<string, string | number>
/** Keys that exist as `<base>_one` / `<base>_other` can be asked for by their base name together with `count`. */
export type PluralBase = Key extends infer K ? (K extends `${infer B}_one` ? B : never) : never
export type TFn = (key: Key | PluralBase, params?: Params) => string

const DICTS: Record<Lang, Record<string, string>> = { en, vi }
const STORAGE_KEY = 'cbt.lang'

/** Saved choice wins (if valid), otherwise the browser language, otherwise English. */
export function detectLang(saved: string | null, navigatorLang: string | undefined): Lang {
  if (saved === 'en' || saved === 'vi') return saved
  return /^vi\b/i.test(navigatorLang ?? '') ? 'vi' : 'en'
}

/** Single pass, so a substituted value is never scanned for placeholders again. Unknown placeholders stay. */
export function format(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

export function translate(lang: Lang, key: Key | PluralBase, params?: Params): string {
  const dict = DICTS[lang]
  let text: string | undefined
  if (typeof params?.count === 'number') text = dict[`${key}_${new Intl.PluralRules(lang).select(params.count)}`]
  return format(text ?? dict[key] ?? key, params)
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: TFn
}
const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang(readSaved(), navigator.language))
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const value = useMemo<I18n>(
    () => ({
      lang,
      t: (key, params) => translate(lang, key, params),
      setLang: (l) => {
        setLangState(l)
        try {
          localStorage.setItem(STORAGE_KEY, l)
        } catch {
          /* storage blocked: the choice lasts for this session */
        }
      },
    }),
    [lang],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>')
  return v
}
