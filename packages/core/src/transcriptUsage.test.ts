import { expect, it } from 'vitest'
import { transcriptUsage } from './transcriptChat.js'

function reply(model: string, input: number, extra: object = {}): string {
  return JSON.stringify({
    type: 'assistant',
    ...extra,
    message: {
      model,
      usage: { input_tokens: input, cache_read_input_tokens: 100, output_tokens: 5 },
    },
  })
}

it('reads the model and prompt size of the last main-thread reply', () => {
  const lines = [reply('old', 1), reply('claude-x', 10), reply('side', 99, { isSidechain: true })]
  expect(transcriptUsage(lines)).toEqual({ model: 'claude-x', contextTokens: 115 })
})

it('skips synthetic replies and is empty without one', () => {
  expect(transcriptUsage([reply('<synthetic>', 1)])).toEqual({ model: null, contextTokens: null })
  expect(transcriptUsage([])).toEqual({ model: null, contextTokens: null })
})
