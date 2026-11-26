import { SEASONS } from '@workday/core'
import { expect, it } from 'vitest'
import { cursorSvg, cursorValue } from './cursors.js'

it('draws a well-formed 32px cursor for every season and kind', () => {
  const parser = new DOMParser()
  for (const season of SEASONS) {
    for (const kind of ['default', 'pointer'] as const) {
      const svg = parser.parseFromString(cursorSvg(season, kind), 'image/svg+xml')
      expect(svg.querySelector('parsererror')).toBeNull()
      expect(svg.documentElement.getAttribute('width')).toBe('32')
    }
  }
})

it('fills the arrow only on the pointer variant', () => {
  expect(cursorSvg('winter', 'default')).toContain('fill="#ffffff"')
  expect(cursorSvg('winter', 'pointer')).not.toContain('fill="#ffffff"')
})

it('builds a CSS cursor value with the tip as hotspot and a native fallback', () => {
  expect(cursorValue('tet', 'default')).toMatch(
    /^url\("data:image\/svg\+xml,%3Csvg.*"\) 3 2, default$/,
  )
  expect(cursorValue('tet', 'pointer')).toMatch(/ 3 2, pointer$/)
})
