import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORKSPACE,
  loadConfig,
  loadGraphTokenOverride,
  loadHrmKey,
  loadSecrets,
  loadTunnelToken,
  NO_SECRETS,
  readFileSecrets,
  saveConfig,
  saveSecrets,
} from './config.js'

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workday-config-'))
  vi.stubEnv('WORKDAY_MASTER_KEY', '')
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
      remote: null,
      workspace: DEFAULT_WORKSPACE,
      timesheet: { logTime: '18:00', hrm: null, tsc: null },
    })
  })

  it('reads the workspace block; a missing or wrong-typed field takes its default', () => {
    writeConfig({
      workspace: {
        devRepoPath: 'C:\\repo',
        startPrompt: 5,
        localOnlyPaths: ['a', 2],
        chatView: true,
      },
    })
    expect(loadConfig(directory).workspace).toEqual({
      ...DEFAULT_WORKSPACE,
      devRepoPath: 'C:\\repo',
      localOnlyPaths: ['a'],
      chatView: true,
    })
    writeConfig({ workspace: 'junk' })
    expect(loadConfig(directory).workspace).toEqual(DEFAULT_WORKSPACE)
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
      mineJql: 'assignee = currentUser() OR assignee WAS currentUser()',
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
    vi.stubEnv('WORKDAY_HRM_API_KEY', '')
    vi.stubEnv('WORKDAY_TUNNEL_TOKEN', '')
    expect(loadSecrets(directory)).toEqual({
      jiraApiToken: null,
      hrmApiKey: null,
      tunnelToken: null,
      vapidPrivateKey: null,
    })
  })

  it('reads the token saved in secrets.json', async () => {
    vi.stubEnv('WORKDAY_JIRA_API_TOKEN', '')
    await saveSecrets(directory, { ...NO_SECRETS, jiraApiToken: 'from-file' })
    expect(loadSecrets(directory).jiraApiToken).toBe('from-file')
  })

  it('the token from the environment wins over secrets.json', () => {
    writeFileSync(join(directory, 'secrets.json'), JSON.stringify({ jiraApiToken: 'from-file' }))
    vi.stubEnv('WORKDAY_JIRA_API_TOKEN', 'from-env')
    expect(loadSecrets(directory).jiraApiToken).toBe('from-env')
  })

  it.skipIf(process.platform === 'win32')('writes secrets.json with mode 600', async () => {
    await saveSecrets(directory, { ...NO_SECRETS, jiraApiToken: 't' })
    expect(statSync(join(directory, 'secrets.json')).mode % 0o1000).toBe(0o600)
  })

  it('saveSecrets never writes a plain value', async () => {
    await saveSecrets(directory, { ...NO_SECRETS, jiraApiToken: 'visible', tunnelToken: 'tt' })
    const text = readFileSync(join(directory, 'secrets.json'), 'utf8')
    expect(text).not.toContain('visible')
    expect(text).toContain('enc:v1:')
    expect(readFileSecrets(directory).jiraApiToken).toBe('visible')
    expect(readFileSecrets(directory).tunnelToken).toBe('tt')
  })

  it('a plain-text secrets.json is rewritten sealed on load', () => {
    writeFileSync(join(directory, 'secrets.json'), JSON.stringify({ hrmApiKey: 'plain-key' }))
    expect(readFileSecrets(directory).hrmApiKey).toBe('plain-key')
    const text = readFileSync(join(directory, 'secrets.json'), 'utf8')
    expect(text).not.toContain('plain-key')
    expect(text).toContain('enc:v1:')
    expect(readFileSecrets(directory).hrmApiKey).toBe('plain-key')
  })

  it('a value sealed with a lost key loads as null without throwing', async () => {
    await saveSecrets(directory, { ...NO_SECRETS, hrmApiKey: 'gone' })
    rmSync(join(directory, 'master.key'))
    expect(readFileSecrets(directory).hrmApiKey).toBeNull()
  })

  it('the tunnel token from the environment wins over secrets.json', async () => {
    await saveSecrets(directory, { ...NO_SECRETS, tunnelToken: 'from-file' })
    vi.stubEnv('WORKDAY_TUNNEL_TOKEN', '')
    expect(loadTunnelToken(directory)).toEqual({ token: 'from-file', source: 'file' })
    vi.stubEnv('WORKDAY_TUNNEL_TOKEN', 'from-env')
    expect(loadTunnelToken(directory)).toEqual({ token: 'from-env', source: 'env' })
  })
})

describe('remote config', () => {
  const REMOTE = {
    enabled: true,
    publicHost: 'workday.example.com',
    accessTeamDomain: 'team.cloudflareaccess.com',
    accessAud: 'aud123',
  }

  it('a remote config without accessAud loads as null', () => {
    writeConfig({ remote: { ...REMOTE, accessAud: '' } })
    expect(loadConfig(directory).remote).toBeNull()
  })

  it('publicHost drops the scheme and trailing slash', () => {
    writeConfig({ remote: { ...REMOTE, publicHost: 'https://Workday.Example.com/' } })
    expect(loadConfig(directory).remote).toEqual({
      ...REMOTE,
      cloudflaredPath: null,
    })
  })

  it('enabled defaults to false', () => {
    writeConfig({ remote: { ...REMOTE, enabled: undefined, cloudflaredPath: 'C:\\cf.exe' } })
    const remote = loadConfig(directory).remote
    expect(remote?.enabled).toBe(false)
    expect(remote?.cloudflaredPath).toBe('C:\\cf.exe')
  })
})

const HRM = { mcpUrl: 'https://hrm.example/mcp', projectId: 'P1' }
const TSC = {
  shareUrl: 'https://share.example/x',
  worksheetPattern: 'Daily Reports - {year}',
  columns: 'M, J',
  tokenPages: ['https://tsc.example/a'],
}

describe('timesheet config', () => {
  it('a timesheet config without columns loads with tsc null', () => {
    writeConfig({ timesheet: { hrm: HRM, tsc: { ...TSC, columns: '' } } })
    const { timesheet } = loadConfig(directory)
    expect(timesheet.tsc).toBeNull()
    expect(timesheet.hrm).toEqual(HRM)
  })

  it('tsc is null without a share URL, worksheet pattern or token pages', () => {
    for (const missing of ['shareUrl', 'worksheetPattern', 'tokenPages']) {
      writeConfig({ timesheet: { tsc: { ...TSC, [missing]: undefined } } })
      expect(loadConfig(directory).timesheet.tsc).toBeNull()
    }
    writeConfig({ timesheet: { tsc: { ...TSC, tokenPages: [] } } })
    expect(loadConfig(directory).timesheet.tsc).toBeNull()
  })

  it('hrm is null without an MCP URL or project id', () => {
    writeConfig({ timesheet: { hrm: { mcpUrl: HRM.mcpUrl } } })
    expect(loadConfig(directory).timesheet.hrm).toBeNull()
    writeConfig({ timesheet: { hrm: { projectId: 'P1' } } })
    expect(loadConfig(directory).timesheet.hrm).toBeNull()
  })

  it('parses tsc columns from a string or an array, with neutral defaults', () => {
    writeConfig({ timesheet: { tsc: TSC } })
    expect(loadConfig(directory).timesheet.tsc).toEqual({
      shareUrl: TSC.shareUrl,
      worksheetPattern: TSC.worksheetPattern,
      columns: ['M', 'J'],
      headerRows: 2,
      offMarker: 'OFF',
      offFillColor: '#FFFF00',
      tokenPages: TSC.tokenPages,
      driveId: null,
      itemId: null,
    })
    writeConfig({ timesheet: { tsc: { ...TSC, columns: ['m', 'j'], headerRows: 0 } } })
    const tsc = loadConfig(directory).timesheet.tsc
    expect(tsc?.columns).toEqual(['M', 'J'])
    expect(tsc?.headerRows).toBe(0)
  })

  it('headerRows that is not a whole number >= 0 falls back to 2', () => {
    writeConfig({ timesheet: { tsc: { ...TSC, headerRows: -1 } } })
    expect(loadConfig(directory).timesheet.tsc?.headerRows).toBe(2)
    writeConfig({ timesheet: { tsc: { ...TSC, headerRows: 1.5 } } })
    expect(loadConfig(directory).timesheet.tsc?.headerRows).toBe(2)
  })

  it('logTime 25:00 falls back to 18:00', () => {
    writeConfig({ timesheet: { logTime: '25:00' } })
    expect(loadConfig(directory).timesheet.logTime).toBe('18:00')
    writeConfig({ timesheet: { logTime: '17:30' } })
    expect(loadConfig(directory).timesheet.logTime).toBe('17:30')
  })

  it('reads mineJql from the Jira config', () => {
    writeConfig({
      jira: {
        baseUrl: 'https://x',
        email: 'a@b.c',
        projectKey: 'MDP',
        mineJql: 'cf[1] = currentUser()',
      },
    })
    expect(loadConfig(directory).jira?.mineJql).toBe('cf[1] = currentUser()')
  })
})

describe('HRM key', () => {
  it('the HRM key from the environment wins over secrets.json', () => {
    writeFileSync(join(directory, 'secrets.json'), JSON.stringify({ hrmApiKey: 'from-file' }))
    vi.stubEnv('WORKDAY_HRM_API_KEY', '')
    expect(loadHrmKey(directory)).toEqual({ key: 'from-file', source: 'file' })
    vi.stubEnv('WORKDAY_HRM_API_KEY', 'from-env')
    expect(loadHrmKey(directory)).toEqual({ key: 'from-env', source: 'env' })
  })

  it('has no key by default', () => {
    vi.stubEnv('WORKDAY_HRM_API_KEY', '')
    expect(loadHrmKey(directory)).toEqual({ key: null, source: null })
  })
})

describe('Graph token override', () => {
  it('comes only from WORKDAY_MS_GRAPH_TOKEN', () => {
    vi.stubEnv('WORKDAY_MS_GRAPH_TOKEN', '')
    expect(loadGraphTokenOverride()).toBeNull()
    vi.stubEnv('WORKDAY_MS_GRAPH_TOKEN', 'graph')
    expect(loadGraphTokenOverride()).toBe('graph')
  })
})
