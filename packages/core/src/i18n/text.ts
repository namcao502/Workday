import { en } from './en.js'
import { vi } from './vi.js'

type Catalog = typeof en

// vi.ts: every area and key of en.ts, each a string.
export type CoreMessages = {
  readonly [Area in keyof Catalog]: { readonly [Key in keyof Catalog[Area]]: string }
}

// "area.key", checked against en.ts.
export type CoreTextKey = {
  [Area in Extract<keyof Catalog, string>]: `${Area}.${Extract<keyof Catalog[Area], string>}`
}[Extract<keyof Catalog, string>]

export type TextParams = Readonly<Record<string, string | number>>

const CATALOGS: Readonly<Record<'en' | 'vi', CoreMessages>> = { en, vi }
const PLACEHOLDER = /\{(\w+)\}/g

// The text of "area.key" in that language, its {name} placeholders filled from params.
export function coreText(language: 'en' | 'vi', key: CoreTextKey, params?: TextParams): string {
  const [area = '', name = ''] = key.split('.')
  const texts = CATALOGS[language] as Readonly<Record<string, Readonly<Record<string, string>>>>
  const text = texts[area]?.[name] ?? key
  if (params === undefined) {
    return text
  }
  return text.replace(PLACEHOLDER, (match, param: string) =>
    Object.hasOwn(params, param) ? String(params[param]) : match,
  )
}
