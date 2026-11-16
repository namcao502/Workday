import { expect, it } from 'vitest'
import { splitGuide } from './guideSections.js'

it('splitGuide splits on level-2 headings', () => {
  const sections = splitGuide('## One\n\nA\n\n## Two\n\nB\n\n## Three\n\nC\n')
  expect(sections.map((s) => s.title)).toEqual(['One', 'Two', 'Three'])
  expect(sections.map((s) => s.id)).toEqual(['one', 'two', 'three'])
  expect(sections[1]?.body.trim()).toBe('B')
})

it('splitGuide keeps the text before the first heading as the intro', () => {
  const sections = splitGuide('# Title\n\nHello\n\n## One\n\nA')
  expect(sections[0]?.id).toBe('intro')
  expect(sections[0]?.body).toContain('Hello')
  expect(sections).toHaveLength(2)
})

it('splitGuide ignores headings inside a code fence', () => {
  const sections = splitGuide('## One\n\n```md\n## Not a section\n```\n\n## Two\n\nB')
  expect(sections.map((s) => s.title)).toEqual(['One', 'Two'])
  expect(sections[0]?.body).toContain('## Not a section')
})

it('splitGuide gives duplicate titles distinct ids', () => {
  const sections = splitGuide('## Ticket\n\na\n\n## Ticket\n\nb\n\n## Ticket\n\nc')
  expect(sections.map((s) => s.id)).toEqual(['ticket', 'ticket-2', 'ticket-3'])
})
