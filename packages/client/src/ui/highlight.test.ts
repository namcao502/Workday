import { expect, it } from 'vitest'
import { highlightAuto, highlightLines, languageOf } from './highlight.js'

it('picks the language from the file extension, null when unknown', () => {
  expect(languageOf('src/Portal/Order.cs')).toBe('csharp')
  expect(languageOf('App_Data/Proc.SQL')).toBe('sql')
  expect(languageOf('client/src/App.tsx')).toBe('typescript')
  expect(languageOf('notes.unknownext')).toBeNull()
})

it('keeps one entry per line and carries a multi-line comment onto the next line', () => {
  const lines = highlightLines('/* one\ntwo */\nreturn 1;', 'csharp')
  expect(lines).toHaveLength(3)
  expect(lines[1]).toContain('hljs-comment')
  expect(lines[2]).toContain('hljs-keyword')
  for (const line of lines) {
    expect(line.match(/<span/g)?.length ?? 0).toBe(line.match(/<\/span>/g)?.length ?? 0)
  }
})

it('escapes the text, and an unknown language comes back as escaped plain lines', () => {
  expect(highlightLines('a < b', null)).toEqual(['a &lt; b'])
  expect(highlightLines('if (a < b) {}', 'typescript').join('')).toContain('&lt;')
})

it('guesses the language of a code block with no name', () => {
  expect(highlightAuto('SELECT Id FROM dbo.[Order] WHERE Id = 1')).toContain('hljs-keyword')
})
