import { expect, it } from 'vitest'
import {
  activeToken,
  applySuggestion,
  commandSuggestions,
  fileSuggestions,
} from './composerMenu.js'

it('finds a slash command only at the start and an @path anywhere', () => {
  expect(activeToken('/sh', 3)).toEqual({ kind: 'command', start: 0, query: 'sh' })
  expect(activeToken('run /sh', 7)).toBeNull()
  expect(activeToken('look at @src/a', 14)).toEqual({ kind: 'file', start: 8, query: 'src/a' })
  expect(activeToken('mail a@b', 8)).toBeNull()
  expect(activeToken('/ship MDP-1', 11)).toBeNull()
})

it('ranks a prefix match before a contains match and drops the rest', () => {
  const commands = [
    { name: 'review', description: 'r', hint: '' },
    { name: 'ship', description: 's', hint: '<key>' },
    { name: 'reship', description: 'x', hint: '' },
  ]
  expect(commandSuggestions(commands, 'sh').map((item) => item.key)).toEqual(['ship', 'reship'])
  expect(commandSuggestions(commands, 'ship')[0]?.label).toBe('/ship <key>')
  expect(commandSuggestions(commands, 'zzz')).toEqual([])
})

it('replaces the typed token with the chosen file', () => {
  const text = 'read @src/a and more'
  const token = activeToken(text, 11)
  const [suggestion] = fileSuggestions(['src/app.ts', 'docs/a.md'], 'src/a')
  expect(token === null || suggestion === undefined).toBe(false)
  if (token !== null && suggestion !== undefined) {
    expect(applySuggestion(text, 11, token, suggestion)).toEqual({
      text: 'read @src/app.ts  and more',
      caret: 17,
    })
  }
})
