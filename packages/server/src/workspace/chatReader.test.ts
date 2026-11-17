import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readChat } from './chatReader.js'

const line = (text: string): string =>
  `${JSON.stringify({ type: 'user', uuid: text, message: { content: text } })}\n`

it('a transcript that grew shows the new message, and an unchanged one is served again', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'workday-chat-')), 's.jsonl')
  writeFileSync(path, line('one'))
  const first = readChat(path, null, false)
  expect(readChat(path, null, false).messages).toEqual(first.messages)
  appendFileSync(path, line('two'))
  expect(readChat(path, null, false).messages.map((message) => message.text)).toEqual([
    'one',
    'two',
  ])
})
