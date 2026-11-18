import { describe, expect, it } from 'vitest'
import { draftHtml } from './teamsDraft.js'

describe('draftHtml', () => {
  it('keeps a typed line break as <br> and a blank line as an empty paragraph, as Teams writes one', () => {
    const html = draftHtml('first\nsecond\n\nthird\n\n- a\n- b\n')
    expect(html).not.toContain('\n')
    expect(html).toBe(
      '<p>first<br>second</p><p>\u00a0</p><p>third</p><p>\u00a0</p><ul><li>a</li><li>b</li></ul>',
    )
  })
})
