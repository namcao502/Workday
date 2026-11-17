import { describe, expect, it } from 'vitest'
import { draftHtml } from './teamsDraft.js'

describe('draftHtml', () => {
  it('keeps a typed line break as <br> and puts nothing between blocks', () => {
    const html = draftHtml('first\nsecond\n\n- a\n- b\n')
    expect(html).toContain('first<br>second')
    expect(html).not.toContain('\n')
    expect(html).toContain('</p><ul><li>a</li><li>b</li></ul>')
  })
})
