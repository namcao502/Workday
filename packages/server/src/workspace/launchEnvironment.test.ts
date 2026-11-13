import { describe, expect, it } from 'vitest'
import { sessionEnvironment } from './launchEnvironment.js'

describe('sessionEnvironment', () => {
  it('drops Claude session variables and adds TERM', () => {
    const env = sessionEnvironment({
      PATH: '/bin',
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      ANTHROPIC_API_KEY: 'secret',
      NO_COLOR: '1',
      AI_AGENT: 'x',
      DISABLE_AUTOUPDATER: '1',
      EMPTY: undefined,
      TERM: 'dumb',
    })
    expect(env).toEqual({ PATH: '/bin', TERM: 'xterm-256color' })
  })
})
