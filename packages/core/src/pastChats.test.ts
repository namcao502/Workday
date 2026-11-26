import { expect, it } from 'vitest'
import { pastChatTitle } from './pastChats.js'

const prompt = (content: string): string =>
  JSON.stringify({ type: 'user', uuid: 'u1', message: { role: 'user', content } })
const title = (customTitle: string): string => JSON.stringify({ type: 'custom-title', customTitle })

it('the last custom title wins, wherever it is', () => {
  expect(pastChatTitle([prompt('fix the board'), title('old')], [title('board-fix')])).toBe(
    'board-fix',
  )
  expect(pastChatTitle([title('only-head')], [])).toBe('only-head')
})

it('without a title, the first prompt names the chat, on one line and cut', () => {
  const reminder = prompt('<system-reminder>\nnot this\n</system-reminder>')
  expect(pastChatTitle([reminder, prompt('  check the\nmd files  ')], [])).toBe(
    'check the md files',
  )
  const long = 'x'.repeat(200)
  expect(pastChatTitle([prompt(long)], [])).toBe(`${'x'.repeat(77)}...`)
})

it('a chat with no prompt and no title has no title; broken lines are skipped', () => {
  expect(pastChatTitle(['{broken', JSON.stringify({ type: 'assistant' })], [])).toBeNull()
})
