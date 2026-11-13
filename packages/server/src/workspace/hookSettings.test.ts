import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hookSettingsJson, writeHookSettings } from './hookSettings.js'

const URL = 'http://127.0.0.1:4870/api/hooks/abc/claude'
const EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SessionEnd',
]

describe('hookSettingsJson', () => {
  it('posts all six events to the URL with a 5 second timeout', () => {
    const parsed = JSON.parse(hookSettingsJson(URL)) as {
      hooks: Record<string, { hooks: { type: string; url: string; timeout: number }[] }[]>
    }
    expect(Object.keys(parsed.hooks).sort()).toEqual([...EVENTS].sort())
    for (const eventName of EVENTS) {
      expect(parsed.hooks[eventName]).toEqual([{ hooks: [{ type: 'http', url: URL, timeout: 5 }] }])
    }
  })
})

describe('writeHookSettings', () => {
  it('writes <dataDir>/claude-hooks/<session>.json and returns its path', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'workday-hooks-'))
    const path = writeHookSettings(dataDir, 'ABC-1~2', URL)
    expect(path).toBe(join(dataDir, 'claude-hooks', 'ABC-1~2.json'))
    expect(readFileSync(path ?? '', 'utf8')).toBe(hookSettingsJson(URL))
  })

  it('returns null when the file cannot be written', () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), 'workday-hooks-')), 'x\0bad')
    expect(writeHookSettings(dataDir, 'claude', URL, () => undefined)).toBeNull()
  })
})
