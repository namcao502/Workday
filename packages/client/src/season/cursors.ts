import type { Season } from '@workday/core'
import { seasonMotif } from './motifs.js'

// Seasonal mouse cursors: the system arrow shape outlined in the season's accent with a small motif at its
// tail; the pointer variant fills the arrow and enlarges the motif. Text, resize and wait cursors stay native.

export type CursorKind = 'default' | 'pointer'

// The arrow in a 32px box; its tip is the hotspot, so the motif never moves where a click lands.
const ARROW = 'M3 2 L3 22 L8.2 17.2 L11.6 25 L15 23.5 L11.7 16 L18.5 16 Z'
const HOTSPOT = '3 2'

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

export function cursorSvg(season: Season, kind: CursorKind): string {
  const accent = ACCENT[season]
  const pointer = kind === 'pointer'
  const fill = pointer ? accent : '#ffffff'
  const outline = pointer ? '#ffffff' : accent
  const scale = pointer ? 0.95 : 0.75
  // The dark halo under the colored outline keeps the arrow visible on light and dark backdrops alike.
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    `<path d="${ARROW}" fill="${fill}" stroke="#1f2430" stroke-opacity=".35" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="${ARROW}" fill="${fill}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<g transform="translate(24 24) scale(${String(scale)})">${seasonMotif(season)}</g></svg>`
  )
}

// A full CSS cursor value with the native cursor as the fallback.
export function cursorValue(season: Season, kind: CursorKind): string {
  const url = `data:image/svg+xml,${encodeURIComponent(cursorSvg(season, kind))}`
  return `url("${url}") ${HOTSPOT}, ${kind === 'pointer' ? 'pointer' : 'default'}`
}
