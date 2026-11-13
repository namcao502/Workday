import { expect, it } from 'vitest'
import { parseTerminalMessage } from './terminalSocket.js'

it('reads the three server message shapes from a JSON string', () => {
  expect(parseTerminalMessage('{"type":"output","data":"hi"}')).toEqual({
    type: 'output',
    data: 'hi',
  })
  expect(parseTerminalMessage('{"type":"exited"}')).toEqual({ type: 'exited' })
  expect(parseTerminalMessage('{"type":"error","code":"sessionNotFound"}')).toEqual({
    type: 'error',
    code: 'sessionNotFound',
  })
})

it('drops unknown or malformed messages', () => {
  expect(parseTerminalMessage('{"type":"bogus"}')).toBeNull()
  expect(parseTerminalMessage('{"type":"output"}')).toBeNull()
  expect(parseTerminalMessage('{"type":"error","code":"nope"}')).toBeNull()
  expect(parseTerminalMessage('not json')).toBeNull()
  expect(parseTerminalMessage(42)).toBeNull()
  expect(parseTerminalMessage(null)).toBeNull()
})
