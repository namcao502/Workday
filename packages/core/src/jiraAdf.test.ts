import { describe, expect, it } from 'vitest'
import { adfToText } from './jiraAdf.js'

const text = (value: string): object => ({ type: 'text', text: value })
const paragraph = (...content: object[]): object => ({ type: 'paragraph', content })
const doc = (...content: object[]): object => ({ type: 'doc', version: 1, content })

describe('adfToText', () => {
  it('renders a paragraph with a mention and a hard break', () => {
    const node = doc(
      paragraph(
        text('Ask '),
        { type: 'mention', attrs: { text: '@Minh' } },
        text(' first'),
        { type: 'hardBreak' },
        text('go'),
      ),
    )
    expect(adfToText(node)).toBe('Ask @Minh first\ngo')
  })

  it('renders bullet and ordered lists', () => {
    const item = (value: string): object => ({
      type: 'listItem',
      content: [paragraph(text(value))],
    })
    const node = doc(
      { type: 'bulletList', content: [item('one'), item('two')] },
      { type: 'orderedList', content: [item('first'), item('second')] },
    )
    expect(adfToText(node)).toBe('- one\n- two\n\n1. first\n2. second')
  })

  it('renders a code block', () => {
    const node = doc({ type: 'codeBlock', content: [text('SELECT 1')] }, { type: 'mediaSingle' })
    expect(adfToText(node)).toBe('```\nSELECT 1\n```\n\n[image]')
  })

  it('reads an unknown node as its children and collapses blank runs', () => {
    const node = doc(paragraph(text('a')), paragraph(), paragraph(), {
      type: 'panel',
      content: [paragraph({ type: 'emoji', attrs: { shortName: ':ok:' } }, text(' b'))],
    })
    expect(adfToText(node)).toBe('a\n\n:ok: b')
  })

  it('keeps a plain string and reads other shapes as empty', () => {
    expect(adfToText('line one\r\nline two\r\n')).toBe('line one\nline two')
    expect(adfToText(null)).toBe('')
    expect(adfToText(42)).toBe('')
  })

  it('renders a table row per line', () => {
    const cell = (type: string, value: string): object => ({
      type,
      content: [paragraph(text(value))],
    })
    const node = doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
        { type: 'tableRow', content: [cell('tableCell', '1'), cell('tableCell', '2')] },
      ],
    })
    expect(adfToText(node)).toBe('A | B\n1 | 2')
  })
})
