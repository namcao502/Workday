import type { Season } from '@workday/core'
import { seasonMotif } from './motifs.js'

// Seasonal mouse cursors, one for every cursor kind the app shows: white shapes outlined in the season's accent over
// a dark halo. The arrow and the pointing hand carry the season's motif inside them.

export const CURSOR_KINDS = [
  'default',
  'pointer',
  'text',
  'notAllowed',
  'colResize',
  'grab',
  'zoomIn',
] as const
export type CursorKind = (typeof CURSOR_KINDS)[number]

// Where each cursor acts (its hotspot) and the native cursor it stands in for.
const NATIVE: Readonly<Record<CursorKind, { readonly hotspot: string; readonly name: string }>> = {
  default: { hotspot: '3 2', name: 'default' },
  pointer: { hotspot: '11 2', name: 'pointer' },
  text: { hotspot: '16 16', name: 'text' },
  notAllowed: { hotspot: '3 2', name: 'not-allowed' },
  colResize: { hotspot: '16 16', name: 'col-resize' },
  grab: { hotspot: '16 16', name: 'grab' },
  zoomIn: { hotspot: '13 13', name: 'zoom-in' },
}

// The arrow in a 32px box; its tip is the hotspot, so the motif never moves where a click lands.
const ARROW = 'M3 2 L3 22 L8.2 17.2 L11.6 25 L15 23.5 L11.7 16 L18.5 16 Z'
// Drawn at 80% around the tip, so the arrow is about the system one's 12x19 px and the hotspot stays put.
const ARROW_SIZE = 'translate(3 2) scale(0.8) translate(-3 -2)'
const ARROW_MOTIF = 'translate(6.6 10.2) scale(0.42)' // in the widest part of the arrow
// A pointing hand, index finger up, drawn at 85% around its fingertip (the hotspot), about the system hand's size.
const HAND =
  'M9 4 Q9 2 11 2 Q13 2 13 4 L13 10.6 Q13.4 9.8 14.6 9.8 Q16 9.8 16 11.2 Q16.4 10.4 17.6 10.4 Q19 10.4 19 11.8 ' +
  'Q19.4 11.2 20.6 11.2 Q22 11.2 22 12.8 L22 19 Q22 24.5 17 25 L12.5 25 Q10.3 25 9 23 L5.4 17.6 Q4.6 16.2 5.9 15.3 ' +
  'Q7.2 14.5 8.3 15.7 L9 16.6 Z'
const HAND_CREASES = 'M13 10.6 V13.4 M16 11.2 V13.6 M19 11.8 V14'
const HAND_SIZE = 'translate(11 2) scale(0.85) translate(-11 -2)'
const HAND_MOTIF = 'translate(14.8 17.4) scale(0.58)' // in the palm

const COL_RESIZE = '3,16 9,10 9,14 23,14 23,10 29,16 23,22 23,18 9,18 9,22' // a left-right double arrow
const MOVE =
  '16,3 21,8 18,8 18,14 24,14 24,11 29,16 24,21 24,18 18,18 18,24 21,24 16,29 11,24 14,24 14,18 ' +
  '8,18 8,21 3,16 8,11 8,14 14,14 14,8 11,8' // four arrows out of the middle

// Close to each season's --accent in season.css, as hex because a cursor image cannot read CSS variables.
const ACCENT: Readonly<Record<Season, string>> = {
  spring: '#d9578a',
  summer: '#1a94b0',
  autumn: '#d9702a',
  winter: '#2f7fc0',
  christmas: '#c8392f',
  tet: '#cf3a24',
  midautumn: '#d27b1c',
  rain: '#4f6f92',
}

const HALO = 'stroke="#1f2430" stroke-opacity=".35" stroke-linejoin="round" stroke-linecap="round"'

// A closed shape twice: once wide and dark for the halo, once with the colored outline on top.
function outlined(shape: (paint: string) => string, fill: string, outline: string): string {
  return (
    shape(`fill="${fill}" ${HALO} stroke-width="3.2"`) +
    shape(`fill="${fill}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"`)
  )
}

// An open line drawing (the text beam, the lens handle): dark halo, white body, colored core.
function stroked(d: string, accent: string, width: number): string {
  return (
    `<path d="${d}" fill="none" ${HALO} stroke-width="${String(width + 2.4)}"/>` +
    `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${String(width + 1)}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${accent}" stroke-width="${String(width)}" stroke-linecap="round"/>`
  )
}

function arrow(accent: string): string {
  return `<g transform="${ARROW_SIZE}">${outlined((paint) => `<path d="${ARROW}" ${paint}/>`, '#ffffff', accent)}</g>`
}

function hand(accent: string): string {
  return (
    `<g transform="${HAND_SIZE}">${outlined((paint) => `<path d="${HAND}" ${paint}/>`, '#ffffff', accent)}` +
    `<path d="${HAND_CREASES}" stroke="${accent}" stroke-width="1" stroke-linecap="round" opacity=".8"/></g>`
  )
}

function motif(season: Season, at: string): string {
  return `<g transform="${at}">${seasonMotif(season)}</g>`
}

function body(season: Season, kind: CursorKind): string {
  const accent = ACCENT[season]
  switch (kind) {
    case 'default':
      return arrow(accent) + motif(season, ARROW_MOTIF)
    case 'pointer':
      return hand(accent) + motif(season, HAND_MOTIF)
    case 'text':
      return (
        stroked('M12 6 H20 M16 6 V26 M12 26 H20', accent, 1.6) +
        motif(season, 'translate(24 9) scale(0.45)')
      )
    case 'notAllowed':
      // The arrow with a "no" sign where the motif would be.
      return (
        arrow(accent) +
        outlined((paint) => `<circle cx="18" cy="19" r="4.6" ${paint}/>`, '#ffffff', accent) +
        `<path d="M14.9 22.1 L21.1 15.9" stroke="${accent}" stroke-width="1.6" stroke-linecap="round"/>`
      )
    case 'colResize':
      return (
        outlined((paint) => `<polygon points="${COL_RESIZE}" ${paint}/>`, '#ffffff', accent) +
        stroked('M16 7 V25', accent, 1.4)
      )
    case 'grab':
      return outlined((paint) => `<polygon points="${MOVE}" ${paint}/>`, '#ffffff', accent)
    case 'zoomIn':
      return (
        stroked('M19 19 L27 27', accent, 2.4) +
        outlined((paint) => `<circle cx="13" cy="13" r="8" ${paint}/>`, '#ffffff', accent) +
        `<path d="M9.5 13 H16.5 M13 9.5 V16.5" stroke="${accent}" stroke-width="1.6" stroke-linecap="round"/>`
      )
  }
}

export function cursorSvg(season: Season, kind: CursorKind): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    `${body(season, kind)}</svg>`
  )
}

// A full CSS cursor value with the native cursor as the fallback.
export function cursorValue(season: Season, kind: CursorKind): string {
  const url = `data:image/svg+xml,${encodeURIComponent(cursorSvg(season, kind))}`
  const { hotspot, name } = NATIVE[kind]
  return `url("${url}") ${hotspot}, ${name}`
}

// The CSS variable season.css reads for each kind.
export const CURSOR_VARIABLES: Readonly<Record<CursorKind, string>> = {
  default: '--season-cursor',
  pointer: '--season-cursor-pointer',
  text: '--season-cursor-text',
  notAllowed: '--season-cursor-not-allowed',
  colResize: '--season-cursor-col-resize',
  grab: '--season-cursor-grab',
  zoomIn: '--season-cursor-zoom-in',
}
