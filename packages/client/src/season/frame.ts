import type { Season } from '@workday/core'
import { seasonMotif } from './motifs.js'

// The seasonal frame around the sidebar: one square tile, sliced by CSS border-image (season.css) so its corners
// stay put and each edge repeats a cord with a motif in the middle, whatever the sidebar's size.

export const FRAME_TILE = 88
export const FRAME_SLICE = 22 // season.css repeats this value in border-image-slice and border-width

const MID = FRAME_SLICE / 2 // the cord runs along the middle of the border band
const FAR = FRAME_TILE - MID
const SAG = 4 // each edge's cord bows outward, away from the sidebar's content

// The cord's color per season, light theme then dark theme.
const CORD: Readonly<Record<Season, readonly [string, string]>> = {
  spring: ['#6aa05a', '#8cc47c'],
  summer: ['#d9a24a', '#e8c27a'],
  autumn: ['#8a5a3a', '#c08a5a'],
  winter: ['#7fb0dc', '#a9cdee'],
  christmas: ['#2f4a36', '#9fb6a4'],
  tet: ['#6b4a36', '#b58a6a'],
  midautumn: ['#8a6a4a', '#c9a27a'],
  rain: ['#7f9fc4', '#a9c6e4'],
}

// Two bulbs per edge, so the colors alternate all the way round: top, right, bottom, left.
const BULB_PAIRS: readonly (readonly [string, string])[] = [
  ['#e5484d', '#f5b83d'],
  ['#30a46c', '#e5484d'],
  ['#f5b83d', '#30a46c'],
  ['#e5484d', '#30a46c'],
]
const BULB_GAP = 11 // half the distance between an edge's two bulbs

function bulb(color: string): string {
  return (
    '<rect x="-1.4" y="-6" width="2.8" height="2.6" rx=".6" fill="#5b6b5f"/>' +
    `<circle r="7" fill="${color}" opacity=".18"/><ellipse rx="3.2" ry="4.4" fill="${color}"/>`
  )
}

// Edge motifs in order top, right, bottom, left, drawn along the local x axis of the rotated edge.
function edgeMotif(season: Season, edge: number): string {
  if (season !== 'christmas') {
    return seasonMotif(season)
  }
  const [first, second] = BULB_PAIRS[edge] ?? ['#e5484d', '#f5b83d']
  return (
    `<g transform="translate(${String(-BULB_GAP)} 0)">${bulb(first)}</g>` +
    `<g transform="translate(${String(BULB_GAP)} 0)">${bulb(second)}</g>`
  )
}

export function frameSvg(season: Season, dark: boolean): string {
  const cord = CORD[season][dark ? 1 : 0]
  const half = FRAME_TILE / 2
  // Corners round off; each edge's middle slice bows outward and returns to the band's middle at both ends.
  const path =
    `M${String(MID)} ${String(FRAME_SLICE)} Q${String(MID)} ${String(MID)} ${String(FRAME_SLICE)} ${String(MID)}` +
    ` Q${String(half)} ${String(MID - SAG)} ${String(FAR - MID)} ${String(MID)}` +
    ` Q${String(FAR)} ${String(MID)} ${String(FAR)} ${String(FRAME_SLICE)}` +
    ` Q${String(FAR + SAG)} ${String(half)} ${String(FAR)} ${String(FAR - MID)}` +
    ` Q${String(FAR)} ${String(FAR)} ${String(FAR - MID)} ${String(FAR)}` +
    ` Q${String(half)} ${String(FAR + SAG)} ${String(FRAME_SLICE)} ${String(FAR)}` +
    ` Q${String(MID)} ${String(FAR)} ${String(MID)} ${String(FAR - MID)}` +
    ` Q${String(MID - SAG)} ${String(half)} ${String(MID)} ${String(FRAME_SLICE)}`
  const bow = MID - SAG / 2
  const spots: readonly (readonly [number, number, number])[] = [
    [half, bow, 180],
    [FRAME_TILE - bow, half, -90],
    [half, FRAME_TILE - bow, 0],
    [bow, half, 90],
  ]
  const motifs = spots.map(
    ([x, y, angle], edge) =>
      `<g transform="translate(${String(x)} ${String(y)}) rotate(${String(angle)}) scale(.85)">${edgeMotif(season, edge)}</g>`,
  )
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(FRAME_TILE)}" height="${String(FRAME_TILE)}">` +
    `<path d="${path}" fill="none" stroke="${cord}" stroke-width="1.4" stroke-linecap="round"/>` +
    `${motifs.join('')}</svg>`
  )
}

export function frameValue(season: Season, dark: boolean): string {
  return `url("data:image/svg+xml,${encodeURIComponent(frameSvg(season, dark))}")`
}
