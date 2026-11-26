import { expect, it } from 'vitest'
import {
  activeToken,
  applySuggestion,
  commandSuggestions,
  fileSuggestions,
  pastChatSuggestions,
  withResume,
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

it('/resume with a space opens the chat list; its text filters the titles', () => {
  expect(activeToken('/resume ', 8)).toEqual({ kind: 'resume', start: 0, query: '' })
  expect(activeToken('/resume board fix', 17)).toEqual({
    kind: 'resume',
    start: 0,
    query: 'board fix',
  })
  expect(activeToken('/resume', 7)).toEqual({ kind: 'command', start: 0, query: 'resume' })
})

it('resume is offered first among the commands and only once', () => {
  const commands = [
    { name: 'review', description: 'r', hint: '' },
    { name: 'resume', description: 'from the SDK', hint: '' },
  ]
  const merged = withResume(commands, 'Resume an earlier chat')
  expect(merged.map((command) => command.name)).toEqual(['resume', 'review'])
  expect(merged[0]?.description).toBe('Resume an earlier chat')
})

it('lists the past chats matching every typed word, newest first as given', () => {
  const chats = [
    { id: 'a', title: 'Fix the board view', modifiedAt: '2026-11-25T01:00:00Z', current: false },
    { id: 'b', title: null, modifiedAt: '2026-11-24T01:00:00Z', current: true },
    { id: 'c', title: 'Board totals', modifiedAt: '2026-11-23T01:00:00Z', current: false },
  ]
  const label = (chat: (typeof chats)[number]): string => chat.title ?? '(no prompt)'
  const note = (chat: (typeof chats)[number]): string => chat.modifiedAt.slice(0, 10)
  expect(pastChatSuggestions(chats, '', label, note).map((item) => item.key)).toEqual([
    'a',
    'b',
    'c',
  ])
  expect(pastChatSuggestions(chats, 'BOARD fix', label, note)).toEqual([
    { key: 'a', insert: '', label: 'Fix the board view', note: '2026-11-25' },
  ])
})
