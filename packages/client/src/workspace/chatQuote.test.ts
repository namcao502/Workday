import { expect, it } from 'vitest'
import { withQuote } from './chatQuote.js'

it('quotes each line, leaves a blank line to type under, and keeps what was already typed', () => {
  expect(withQuote('', 'Run the tests\nthen push')).toBe('> Run the tests\n> then push\n\n')
  expect(withQuote('About this:  \n', '  step two  ')).toBe('About this:\n\n> step two\n\n')
  // A blank line inside the selection stays part of the quote.
  expect(withQuote('', 'a\n\nb')).toBe('> a\n>\n> b\n\n')
})
