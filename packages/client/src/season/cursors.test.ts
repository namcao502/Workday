import { SEASONS } from '@workday/core'
import { expect, it } from 'vitest'
import { CURSOR_KINDS, cursorSvg, cursorValue } from './cursors.js'

it('draws a well-formed 32px cursor for every season and kind', () => {
  const parser = new DOMParser()
  for (const season of SEASONS) {
    for (const kind of CURSOR_KINDS) {
      const svg = parser.parseFromString(cursorSvg(season, kind), 'image/svg+xml')
      expect(svg.querySelector('parsererror')).toBeNull()
      expect(svg.documentElement.getAttribute('width')).toBe('32')
    }
  }
})

it('draws a white arrow for the page and a white pointing hand for what can be clicked', () => {
  expect(cursorSvg('winter', 'default')).toContain('fill="#ffffff"')
  expect(cursorSvg('winter', 'pointer')).toContain('fill="#ffffff"')
  expect(cursorSvg('winter', 'pointer')).not.toBe(cursorSvg('winter', 'default'))
})

it('acts at the arrow tip and at the fingertip of the hand, with a native fallback', () => {
  expect(cursorValue('tet', 'default')).toMatch(
    /^url\("data:image\/svg\+xml,%3Csvg.*"\) 3 2, default$/,
  )
  expect(cursorValue('tet', 'pointer')).toMatch(/"\) 11 2, pointer$/)
})

it('keeps each motif inside its shape, at the system cursor size', () => {
  const arrow = new DOMParser().parseFromString(cursorSvg('autumn', 'default'), 'image/svg+xml')
  const [arrowShape, arrowMotif] = arrow.querySelectorAll('svg > g')
  expect(arrowShape?.getAttribute('transform')).toBe('translate(3 2) scale(0.8) translate(-3 -2)')
  expect(arrowMotif?.getAttribute('transform')).toBe('translate(6.6 10.2) scale(0.42)')
  const hand = new DOMParser().parseFromString(cursorSvg('autumn', 'pointer'), 'image/svg+xml')
  const [handShape, handMotif] = hand.querySelectorAll('svg > g')
  expect(handShape?.getAttribute('transform')).toBe('translate(11 2) scale(0.85) translate(-11 -2)')
  expect(handMotif?.getAttribute('transform')).toBe('translate(14.8 17.4) scale(0.58)')
})

it('falls back to the matching native cursor, with the hotspot where that cursor acts', () => {
  expect(CURSOR_KINDS).toEqual([
    'default',
    'pointer',
    'text',
    'notAllowed',
    'colResize',
    'grab',
    'zoomIn',
  ])
  expect(cursorValue('rain', 'text')).toMatch(/"\) 16 16, text$/)
  expect(cursorValue('rain', 'notAllowed')).toMatch(/"\) 3 2, not-allowed$/)
  expect(cursorValue('rain', 'colResize')).toMatch(/"\) 16 16, col-resize$/)
  expect(cursorValue('rain', 'grab')).toMatch(/"\) 16 16, grab$/)
  expect(cursorValue('rain', 'zoomIn')).toMatch(/"\) 13 13, zoom-in$/)
})
