import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSecrets } from '../config.js'
import { sealSecret } from '../security/secretBox.js'
import { makeNwcred } from '../testing/nwcredFixture.js'
import {
  importWpf,
  isServerRunning,
  parseImportArgs,
  type ImportOptions,
  type ImportResult,
} from './importWpf.js'

const PASSWORD = 'Corr3ct-Horse'
const JIRA_TOKEN = 'jira-secret-value-123'
const HRM_KEY = 'hrm-secret-value-456'
const ADO_PAT = 'ado-secret-value-789'
const MESSAGE = 'Private message text'
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e'

let dataDir = ''
let from = ''
let credPath = ''
let lines: string[] = []

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value))
}

function ticket(key: string): Record<string, unknown> {
  return { Key: key, Summary: `Summary ${key}`, Status: 'Open' }
}

function writeWpfFolder(): void {
  writeJson(join(from, 'settings.json'), {
    teamsSeenAt: { 'conv-1': '2026-11-01T01:00:00Z' },
    teamsNotifiedAt: { 'conv-1': '2026-11-01T02:00:00Z' },
    teamsPostedAt: { 'MDP-1': '2026-11-02T00:00:00Z' },
    teamsPeople: [{ mri: '8:orgid:1', displayName: 'An' }],
    teamsLastMessage: MESSAGE,
    hiddenTicketSuggestions: ['MDP-9'],
    openTicketTabs: ['MDP-1'],
    claudeSessionIds: { 'MDP-1|C:\\repo': SESSION },
    recentClaudeDirectories: ['C:\\repo'],
    config: { DEV_REPO_PATH: 'C:\\repo' },
  })
  writeJson(join(from, 'queue.json'), { entries: [{ date: '2026-11-10', tickets: ['MDP-1'] }] })
  writeJson(join(from, 'teams-posts.json'), {
    'chan-1': {
      syncedAt: '2026-11-01T00:00:00Z',
      deepScanned: false,
      deepScanPages: 0,
      deepScanLink: null,
      posts: { 'MDP-1': { rootId: 'root-1', sentAt: '2026-11-01T00:00:00Z', mine: true } },
    },
  })
  mkdirSync(join(from, 'tasks'))
  writeJson(join(from, 'tasks', '.jira-started-tickets.json'), { 'MDP-2': ticket('MDP-2') })
  writeJson(join(from, 'tasks', '.jira-done-tickets.json'), { 'MDP-3': ticket('MDP-3') })
  writeJson(join(from, 'tasks', '.jira-assignment-seen.json'), ['MDP-2', 'MDP-3'])
}

function writeWorkdayConfig(jiraBaseUrl = 'https://jira.example.com'): void {
  writeJson(join(dataDir, 'config.json'), {
    jira: { baseUrl: jiraBaseUrl, email: 'me@example.com', projectKey: 'MDP' },
    timesheet: { hrm: { mcpUrl: 'https://hrm.example.com/mcp', projectId: 'p1' } },
  })
}

function writeCred(values: Readonly<Record<string, string>>): void {
  writeFileSync(credPath, makeNwcred(values, PASSWORD))
}

const FULL_CRED = {
  JIRA_BASE_URL: 'https://JIRA.example.com/',
  JIRA_EMAIL: 'me@example.com',
  JIRA_API_TOKEN: JIRA_TOKEN,
  HRM_API_KEY: HRM_KEY,
  AZURE_DEVOPS_PAT: ADO_PAT,
}

function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const path = join(dir, name)
    if (statSync(path).isFile()) {
      files[name] = readFileSync(path, 'base64')
    }
  }
  return files
}

interface RunOverrides extends Partial<ImportOptions> {
  readonly password?: string
}

function run({ password, ...overrides }: RunOverrides = {}): Promise<ImportResult> {
  return importWpf({
    dataDir,
    from,
    cred: null,
    readPassword: () => Promise.resolve(password ?? null),
    dryRun: false,
    log: (line) => lines.push(line),
    environment: {},
    now: new Date(2026, 10, 13, 9, 5, 7),
    isServerRunning: () => Promise.resolve(false),
    ...overrides,
  })
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'workday-import-'))
  dataDir = join(root, 'data')
  from = join(root, 'wpf')
  credPath = join(root, 'export.nwcred')
  mkdirSync(dataDir)
  mkdirSync(from)
  lines = []
  writeWpfFolder()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('importWpf', () => {
  it('dry run writes nothing', async () => {
    writeWorkdayConfig()
    writeCred(FULL_CRED)
    const before = snapshot(dataDir)

    const result = await run({ dryRun: true, cred: credPath, password: PASSWORD })

    expect(result).toEqual({ exitCode: 0, error: null })
    expect(snapshot(dataDir)).toEqual(before)
    expect(lines).toContain('queue: 1 added, 0 kept')
    expect(lines.join('\n')).toContain('jiraApiToken added')
  })

  it('refuses while the server answers on the port', async () => {
    const server: Server = createServer((_request, response) => response.end('{}'))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    writeJson(join(dataDir, 'config.json'), { port })
    const before = snapshot(dataDir)
    const readPassword = vi.fn(() => Promise.resolve(PASSWORD))
    writeCred(FULL_CRED)
    try {
      const result = await run({ isServerRunning, cred: credPath, readPassword })

      expect(result).toEqual({ exitCode: 1, error: 'serverRunning' })
      expect(snapshot(dataDir)).toEqual(before)
      expect(readPassword).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve()
        }),
      )
    }
  })

  it('backs up only the files it changes', async () => {
    writeJson(join(dataDir, 'queue.json'), {
      entries: [{ date: '2026-11-10', tickets: ['MDP-5'] }],
    })
    writeJson(join(dataDir, 'board.json'), {
      new: {},
      inProgress: {},
      done: {},
      dismissed: {},
      seenKeys: null,
    })

    const result = await run()

    expect(result.exitCode).toBe(0)
    const backups = readdirSync(dataDir).filter((name) => name.includes('.before-import-'))
    expect(backups).toEqual(['board.json.before-import-20261113090507'])
    expect(lines).toContain('queue: 0 added, 1 kept')
  })

  it('a second run reports everything kept', async () => {
    writeWorkdayConfig()
    writeCred(FULL_CRED)
    await run({ cred: credPath, password: PASSWORD })
    const afterFirst = snapshot(dataDir)
    lines = []

    await run({ cred: credPath, password: PASSWORD, now: new Date(2026, 10, 13, 10, 0, 0) })

    expect(snapshot(dataDir)).toEqual(afterFirst)
    const added = lines.filter((line) => / added/.test(line) && !/\b0 added/.test(line))
    expect(added).toEqual([])
    expect(lines.join('\n')).toContain('jiraApiToken kept')
  })

  it('the Jira token is skipped when the base URL differs', async () => {
    writeWorkdayConfig('https://other.example.com')
    writeCred(FULL_CRED)

    await run({ cred: credPath, password: PASSWORD })

    const secrets = readFileSecrets(dataDir)
    expect(secrets.jiraApiToken).toBeNull()
    expect(secrets.hrmApiKey).toBe(HRM_KEY)
    expect(secrets.adoPat).toBeNull()
    const report = lines.join('\n')
    expect(report).toContain('jiraApiToken skipped (Jira URL differs)')
    expect(report).toContain('adoPat skipped (no Azure DevOps config)')
  })

  it('a secret whose environment variable is set is skipped', async () => {
    writeWorkdayConfig()
    writeCred(FULL_CRED)

    await run({
      cred: credPath,
      password: PASSWORD,
      environment: { WORKDAY_HRM_API_KEY: 'from-env' },
    })

    expect(readFileSecrets(dataDir).hrmApiKey).toBeNull()
    expect(lines.join('\n')).toContain('hrmApiKey env (WORKDAY_HRM_API_KEY is set)')
  })

  it('a wrong password exits without writing', async () => {
    writeWorkdayConfig()
    writeCred(FULL_CRED)
    const before = snapshot(dataDir)

    const result = await run({ cred: credPath, password: 'Not-It' })

    expect(result).toEqual({ exitCode: 1, error: 'wrongPassword' })
    expect(snapshot(dataDir)).toEqual(before)
  })

  it('a missing password exits without writing', async () => {
    writeCred(FULL_CRED)

    const result = await run({ cred: credPath })

    expect(result).toEqual({ exitCode: 1, error: 'passwordMissing' })
    expect(readdirSync(dataDir)).toEqual([])
  })

  it('a folder without settings.json is refused', async () => {
    const result = await run({ from: dataDir })

    expect(result).toEqual({ exitCode: 1, error: 'notWpfFolder' })
  })

  it('warns when the WPF app may be running', async () => {
    writeFileSync(join(from, 'running'), '1234')

    await run({ dryRun: true })

    expect(lines.some((line) => line.startsWith('warning:'))).toBe(true)
  })

  it('the report never contains a secret value', async () => {
    writeWorkdayConfig()
    writeCred({ ...FULL_CRED, DEV_REPO_PATH: 'D:/hidden-folder' })

    await run({ cred: credPath, password: PASSWORD })

    const report = lines.join('\n')
    for (const secret of [JIRA_TOKEN, HRM_KEY, ADO_PAT, PASSWORD, MESSAGE, 'hidden-folder']) {
      expect(report).not.toContain(secret)
    }
    expect(readFileSecrets(dataDir).jiraApiToken).toBe(JIRA_TOKEN)
  })
})

describe('parseImportArgs', () => {
  it('reads --from, --cred and --dry-run against the base folder', () => {
    const parsed = parseImportArgs(['--from', 'wpf', '--cred', 'x.nwcred', '--dry-run'], '/base')

    expect(parsed).toEqual({
      from: resolve('/base', 'wpf'),
      cred: resolve('/base', 'x.nwcred'),
      dryRun: true,
    })
  })

  it('is null without --from or with an unknown flag', () => {
    expect(parseImportArgs(['--dry-run'], '/base')).toBeNull()
    expect(parseImportArgs(['--from', 'a', '--bogus'], '/base')).toBeNull()
  })
})

async function withServer(test: (port: number) => Promise<void>): Promise<void> {
  const server: Server = createServer((_request, response) => response.end('{}'))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  try {
    await test((server.address() as AddressInfo).port)
  } finally {
    await new Promise<void>((done) => {
      server.close(() => {
        done()
      })
    })
  }
}

describe('importWpf never writes before it is sure', () => {
  it('a dry run with a plain secrets.json writes nothing', async () => {
    writeWorkdayConfig()
    writeCred(FULL_CRED)
    writeFileSync(join(dataDir, 'master.key'), randomBytes(32))
    writeJson(join(dataDir, 'secrets.json'), { hrmApiKey: 'plain-hrm' })
    const before = snapshot(dataDir)

    const result = await run({ dryRun: true, cred: credPath, password: PASSWORD })

    expect(result.exitCode).toBe(0)
    expect(snapshot(dataDir)).toEqual(before)
    expect(lines.join('\n')).toContain('hrmApiKey kept')
  })

  it('a dry run with a corrupt queue.json writes nothing and exits 1', async () => {
    writeFileSync(join(dataDir, 'queue.json'), 'not json')
    const before = snapshot(dataDir)

    const result = await run({ dryRun: true })

    expect(result).toEqual({ exitCode: 1, error: 'workdayFileInvalid' })
    expect(snapshot(dataDir)).toEqual(before)
    expect(lines.join('\n')).toContain('queue.json')
  })

  it('secrets are skipped when secrets.json exists without master.key', async () => {
    writeWorkdayConfig()
    writeCred(FULL_CRED)
    writeJson(join(dataDir, 'secrets.json'), { tunnelToken: sealSecret(randomBytes(32), 'x') })
    const before = snapshot(dataDir)

    await run({ dryRun: true, cred: credPath, password: PASSWORD })

    expect(snapshot(dataDir)).toEqual(before)
    expect(lines).toContain('secrets: skipped (no master.key)')
  })

  it('an undecryptable secret is kept and secrets.json is left as it was', async () => {
    writeWorkdayConfig()
    writeCred(FULL_CRED)
    const otherKey = randomBytes(32)
    writeFileSync(join(dataDir, 'master.key'), randomBytes(32))
    writeJson(join(dataDir, 'secrets.json'), {
      jiraApiToken: sealSecret(otherKey, 'old-jira'),
      tunnelToken: sealSecret(otherKey, 'old-tunnel'),
    })
    const secretsBefore = readFileSync(join(dataDir, 'secrets.json'), 'utf8')

    const result = await run({ cred: credPath, password: PASSWORD })

    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(dataDir, 'secrets.json'), 'utf8')).toBe(secretsBefore)
    const report = lines.join('\n')
    expect(report).toContain('jiraApiToken kept (cannot decrypt)')
    expect(report).toContain('hrmApiKey skipped (secrets.json has values that cannot be decrypted)')
  })

  it('a save failure names what was written and exits 1', async () => {
    mkdirSync(join(dataDir, 'board.json.tmp'))

    const result = await run()

    expect(result).toEqual({ exitCode: 1, error: 'saveFailed' })
    const last = lines.at(-1) ?? ''
    expect(last).toMatch(
      /^wrote queue\.json, .*; failed on board\.json; backups \*\.before-import-/,
    )
    expect(lines.some((line) => line.includes('    at '))).toBe(false)
  })

  it('the health check honours WORKDAY_PORT', async () => {
    await withServer(async (port) => {
      const result = await run({ isServerRunning, environment: { WORKDAY_PORT: String(port) } })

      expect(result).toEqual({ exitCode: 1, error: 'serverRunning' })
    })
  })

  it('the --from check runs before the password is asked', async () => {
    writeCred(FULL_CRED)
    const readPassword = vi.fn(() => Promise.resolve(PASSWORD))

    const result = await run({ from: dataDir, cred: credPath, readPassword })

    expect(result.error).toBe('notWpfFolder')
    expect(readPassword).not.toHaveBeenCalled()
  })
})
