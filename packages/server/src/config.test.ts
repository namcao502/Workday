import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, loadSecrets, saveConfig, saveSecrets } from './config.js'

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workday-config-'))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function writeConfig(value: unknown): void {
  writeFileSync(join(directory, 'config.json'), JSON.stringify(value))
}

describe('loadConfig', () => {
  it('returns the defaults when there is no file', () => {
    expect(loadConfig(directory)).toEqual({
      host: '127.0.0.1',
      port: 4870,
      timeZone: 'Asia/Ho_Chi_Minh',
      pollMinutes: 5,
      theme: 'dark',
      language: 'en',
      jira: null,
    })
  })

  it('takes the default of a field that is missing or of the wrong type', () => {
    writeConfig({ port: 'abc', theme: 'light', language: 'fr' })
    const config = loadConfig(directory)
    expect(config.port).toBe(4870)
    expect(config.theme).toBe('light')
    expect(config.language).toBe('en')
  })

  it('resets a poll interval outside 1..60 to 5', () => {
    writeConfig({ pollMinutes: 0 })
    expect(loadConfig(directory).pollMinutes).toBe(5)
    writeConfig({ pollMinutes: 61 })
    expect(loadConfig(directory).pollMinutes).toBe(5)
    writeConfig({ pollMinutes: 10 })
    expect(loadConfig(directory).pollMinutes).toBe(10)
  })

  it('a config without a Jira base URL loads as not connected', () => {
    writeConfig({ jira: { email: 'a@b.c', projectKey: 'MDP' } })
    expect(loadConfig(directory).jira).toBeNull()
  })

  it('a config with a Jira URL but no project key loads as not connected', () => {
    writeConfig({ jira: { baseUrl: 'https://x.atlassian.net', email: 'a@b.c' } })
    expect(loadConfig(directory).jira).toBeNull()
  })

  it('statusFlow defaults to empty lists and the Jira defaults apply', () => {
    writeConfig({ jira: { baseUrl: 'https://x.atlassian.net', email: 'a@b.c', projectKey: 'MDP' } })
    expect(loadConfig(directory).jira).toEqual({
      baseUrl: 'https://x.atlassian.net',
      email: 'a@b.c',
      projectKey: 'MDP',
      assignedJql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
      maxResults: 50,
      etaFieldId: null,
      devPriorityFieldId: null,
      statusFlow: { preWorkStatuses: [], reworkStatuses: [] },
    })
  })

  it('round-trips through saveConfig', async () => {
    const config = { ...loadConfig(directory), theme: 'light' as const, pollMinutes: 12 }
    await saveConfig(directory, config)
    expect(loadConfig(directory)).toEqual(config)
  })
})

describe('secrets', () => {
  it('has no token by default', () => {
    vi.stubEnv('WORKDAY_JIRA_API_TOKEN', '')
    expect(loadSecrets(directory)).toEqual({ jiraApiToken: null })
  })

  it('reads the token saved in secrets.json', async () => {
    vi.stubEnv('WORKDAY_JIRA_API_TOKEN', '')
    await saveSecrets(directory, { jiraApiToken: 'from-file' })
    expect(loadSecrets(directory).jiraApiToken).toBe('from-file')
  })

  it('the token from the environment wins over secrets.json', () => {
    writeFileSync(join(directory, 'secrets.json'), JSON.stringify({ jiraApiToken: 'from-file' }))
    vi.stubEnv('WORKDAY_JIRA_API_TOKEN', 'from-env')
    expect(loadSecrets(directory).jiraApiToken).toBe('from-env')
  })

  it.skipIf(process.platform === 'win32')('writes secrets.json with mode 600', async () => {
    await saveSecrets(directory, { jiraApiToken: 't' })
    expect(statSync(join(directory, 'secrets.json')).mode % 0o1000).toBe(0o600)
    expect(readFileSync(join(directory, 'secrets.json'), 'utf8')).toContain('"t"')
  })
})
