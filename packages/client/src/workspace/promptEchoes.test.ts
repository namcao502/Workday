import type { ChatMessage } from '@workday/core'
import { afterEach, expect, it } from 'vitest'
import {
  addEcho,
  consumeEchoes,
  dropEchoes,
  newestUserId,
  pendingEchoes,
  readEchoes,
} from './promptEchoes.js'

function row(id: number, role: ChatMessage['role'], text: string): ChatMessage {
  return {
    id,
    role,
    text,
    toolName: null,
    toolDetail: null,
    isError: false,
    at: null,
    uuid: null,
    status: null,
    output: null,
    edit: null,
    todos: null,
  }
}

afterEach(() => {
  dropEchoes('s')
})

it('shows an echo until a user row newer than its send point arrives', () => {
  const before = [row(100, 'user', 'old'), row(200, 'assistant', 'ok')]
  addEcho('s', 'fix it', newestUserId(before))
  expect(pendingEchoes(readEchoes('s'), before)).toEqual(['fix it'])

  const after = [...before, row(300, 'user', 'fix it')]
  expect(pendingEchoes(readEchoes('s'), after)).toEqual([])
  consumeEchoes('s', after)
  expect(readEchoes('s')).toBeNull()
})

it('still clears echoes when the page window slides and drops older user rows', () => {
  // 150-row pages: the new prompt pushes an older prompt off, so counting rows would see no change.
  const before = [row(100, 'user', 'a'), row(200, 'user', 'b')]
  addEcho('s', 'c', newestUserId(before))
  addEcho('s', 'd', newestUserId(before))
  const slid = [row(200, 'user', 'b'), row(300, 'user', 'c')]
  expect(pendingEchoes(readEchoes('s'), slid)).toEqual(['d'])
  consumeEchoes('s', slid)
  const later = [row(300, 'user', 'c'), row(400, 'user', 'd')]
  expect(pendingEchoes(readEchoes('s'), later)).toEqual([])
})

it('an echo sent without a known chat takes the newest row it first sees as its send point', () => {
  addEcho('s', 'look into it', null)
  const seen = [row(100, 'user', 'earlier')]
  expect(pendingEchoes(readEchoes('s'), seen)).toEqual(['look into it'])
  consumeEchoes('s', seen)
  expect(pendingEchoes(readEchoes('s'), seen)).toEqual(['look into it'])
  expect(pendingEchoes(readEchoes('s'), [...seen, row(200, 'user', 'Read task')])).toEqual([])
})

it('an empty chat counts every user row as new', () => {
  addEcho('s', 'hi', newestUserId([]))
  expect(pendingEchoes(readEchoes('s'), [row(10, 'user', 'hi')])).toEqual([])
})
