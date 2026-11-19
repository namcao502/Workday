import type { en } from './en.js'

type Catalog = typeof en

// vi.ts and any other language: every area and key of en.ts, each a string.
export type Messages = {
  readonly [Area in keyof Catalog]: { readonly [Key in keyof Catalog[Area]]: string }
}

// "area.key", checked against en.ts.
export type MessageKey = {
  [Area in Extract<keyof Catalog, string>]: `${Area}.${Extract<keyof Catalog[Area], string>}`
}[Extract<keyof Catalog, string>]

// Fills the {name} placeholders of a text.
export type MessageParams = Readonly<Record<string, string | number>>
