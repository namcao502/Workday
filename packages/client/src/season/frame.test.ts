import { SEASONS } from '@workday/core'
import { expect, it } from 'vitest'
import { FRAME_TILE, frameSvg, frameValue } from './frame.js'

it('draws a well-formed square tile for every season, light and dark', () => {
  const parser = new DOMParser()
  for (const season of SEASONS) {
    for (const dark of [false, true]) {
      const svg = parser.parseFromString(frameSvg(season, dark), 'image/svg+xml')
      expect(svg.querySelector('parsererror')).toBeNull()
      expect(svg.documentElement.getAttribute('width')).toBe(String(FRAME_TILE))
      expect(svg.documentElement.getAttribute('height')).toBe(String(FRAME_TILE))
      // One motif in the middle of each edge.
      expect(svg.querySelectorAll('svg > g')).toHaveLength(4)
    }
  }
})

it('hangs red, gold and green bulbs at Christmas, and lightens the cord in the dark', () => {
  const light = frameSvg('christmas', false)
  expect(light).toContain('#e5484d')
  expect(light).toContain('#f5b83d')
  expect(light).toContain('#30a46c')
  expect(frameSvg('christmas', true)).not.toBe(light)
})

it('builds a CSS image value', () => {
  expect(frameValue('spring', false)).toMatch(/^url\("data:image\/svg\+xml,%3Csvg.*"\)$/)
})
