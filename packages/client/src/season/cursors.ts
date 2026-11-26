import type { Season } from '@workday/core'

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

function round(value: number): string {
  return value.toFixed(2)
}

function petals(fill: string, stroke: string, center: string): string {
  const leaves = [0, 1, 2, 3, 4].map(
    (i) =>
      `<ellipse cy="-3.2" rx="2.4" ry="3" transform="rotate(${String(i * 72)})" fill="${fill}" stroke="${stroke}" stroke-width=".6"/>`,
  )
  return `${leaves.join('')}<circle r="1.6" fill="${center}"/>`
}

function sun(): string {
  const rays = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const angle = (i * Math.PI) / 4
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
    return `<line x1="${round(4.2 * cos)}" y1="${round(4.2 * sin)}" x2="${round(6.4 * cos)}" y2="${round(6.4 * sin)}"/>`
  })
  return (
    `<g stroke="#f59e0b" stroke-width="1.4" stroke-linecap="round">${rays.join('')}</g>` +
    '<circle r="3.3" fill="#fbbf24" stroke="#f59e0b" stroke-width=".8"/>'
  )
}

function snowflake(): string {
  const arms = [0, 1, 2].map(
    (i) =>
      `<g transform="rotate(${String(i * 60)})"><line y1="-6" y2="6"/>` +
      '<polyline points="-1.8,-4.6 0,-3.2 1.8,-4.6" fill="none"/><polyline points="-1.8,4.6 0,3.2 1.8,4.6" fill="none"/></g>',
  )
  return `<g stroke="#0ea5e9" stroke-width="1.3" stroke-linecap="round">${arms.join('')}</g>`
}

function star(): string {
  const points = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
    const radius = i % 2 === 0 ? 6.4 : 2.7
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    return `${round(radius * Math.cos(angle))},${round(radius * Math.sin(angle))}`
  })
  return `<polygon points="${points.join(' ')}" fill="#ef4444" stroke="#facc15" stroke-width="1" stroke-linejoin="round"/>`
}

const MAPLE_LEAF =
  '<path d="M0 -6 L1.4 -2.6 L4.6 -4 L3.6 -0.6 L6 0.4 L2.6 2 L3.2 4.2 L0.6 3 L0.4 6 L-0.4 6 L-0.6 3 L-3.2 4.2 ' +
  'L-2.6 2 L-6 0.4 L-3.6 -0.6 L-4.6 -4 L-1.4 -2.6 Z" fill="#f97316" stroke="#c2410c" stroke-width=".7" stroke-linejoin="round"/>'

const HOLLY =
  '<ellipse cx="-3" cy="1.6" rx="3.6" ry="1.9" transform="rotate(30 -3 1.6)" fill="#16a34a" stroke="#166534" stroke-width=".6"/>' +
  '<ellipse cx="3" cy="1.6" rx="3.6" ry="1.9" transform="rotate(-30 3 1.6)" fill="#16a34a" stroke="#166534" stroke-width=".6"/>' +
  '<circle cx="-1.6" cy="-1.6" r="1.8" fill="#dc2626"/><circle cx="1.6" cy="-1.6" r="1.8" fill="#dc2626"/>' +
  '<circle cx="0" cy="-3.8" r="1.7" fill="#ef4444"/>'

const RAINDROP =
  '<path d="M0 -6 C2.5 -2.5 4.2 0 4.2 2 A4.2 4.2 0 0 1 -4.2 2 C-4.2 0 -2.5 -2.5 0 -6 Z" fill="#60a5fa" stroke="#2563eb" stroke-width=".8"/>' +
  '<path d="M-2 1.6 A2 2 0 0 0 -0.6 3.8" stroke="#fff" stroke-width=".9" fill="none" stroke-linecap="round"/>'

// Each motif is drawn around (0,0) within about +-6 units.
function motif(season: Season): string {
  switch (season) {
    case 'spring':
      return petals('#f9a8c9', '#f472b6', '#fde047')
    case 'summer':
      return sun()
    case 'autumn':
      return MAPLE_LEAF
    case 'winter':
      return snowflake()
    case 'christmas':
      return HOLLY
    case 'tet':
      return petals('#facc15', '#eab308', '#ea580c')
    case 'midautumn':
      return star()
    case 'rain':
      return RAINDROP
  }
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
    `<g transform="translate(24 24) scale(${String(scale)})">${motif(season)}</g></svg>`
  )
}

// A full CSS cursor value with the native cursor as the fallback.
export function cursorValue(season: Season, kind: CursorKind): string {
  const url = `data:image/svg+xml,${encodeURIComponent(cursorSvg(season, kind))}`
  return `url("${url}") ${HOTSPOT}, ${kind === 'pointer' ? 'pointer' : 'default'}`
}
