import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  mergeBoard,
  mergeDevRepoPath,
  mergeHiddenSuggestions,
  mergePostIndex,
  mergeQueue,
  mergeTeamsState,
  mergeWorkspace,
  parseWpfJson,
  type MergeCount,
  type WorkdayConfig,
} from '@workday/core'
import { loadBoard, parseBoard, saveBoard } from '../boardStore.js'
import {
  ADO_PAT_ENVIRONMENT_VARIABLE,
  HRM_KEY_ENVIRONMENT_VARIABLE,
  loadConfig,
  parseConfig,
  peekFileSecrets,
  readPort,
  saveConfig,
  saveSecrets,
  TOKEN_ENVIRONMENT_VARIABLE,
  type Secrets,
} from '../config.js'
import { isRecord, isValidJsonFile } from '../jsonFile.js'
import {
  loadSuggestionState,
  parseSuggestionState,
  saveSuggestionState,
} from '../suggestions/suggestionStore.js'
import {
  loadPostIndex,
  loadTeamsState,
  parsePostIndex,
  parseTeamsState,
  savePostIndex,
  saveTeamsState,
} from '../teams/teamsStore.js'
import { loadQueue, parseQueue, saveQueue } from '../timesheet/queueStore.js'
import { loadWorkspace, parseWorkspaceFile, saveWorkspace } from '../workspace/workspaceStore.js'
import { NwcredError, openNwcred, type NwcredErrorCode } from './nwcred.js'

export type ImportErrorCode =
  | 'workdayFileInvalid'
  | 'badPort'
  | 'serverRunning'
  | 'notWpfFolder'
  | 'passwordMissing'
  | 'credUnreadable'
  | 'backupFailed'
  | 'saveFailed'
  | NwcredErrorCode

export interface ImportOptions {
  readonly dataDir: string
  readonly from: string
  readonly cred: string | null
  // Called only after the server and --from checks pass, so a refused run never prompts.
  readonly readPassword: () => Promise<string | null>
  readonly dryRun: boolean
  readonly log: (line: string) => void
  readonly environment?: NodeJS.ProcessEnv
  readonly now?: Date
  readonly isServerRunning?: (port: number) => Promise<boolean>
}

export interface ImportResult {
  readonly exitCode: 0 | 1
  readonly error: ImportErrorCode | null
}

export interface ImportArgs {
  readonly from: string
  readonly cred: string | null
  readonly dryRun: boolean
}

interface Change {
  readonly file: string
  readonly save: () => Promise<void>
}

interface Section {
  readonly lines: readonly string[]
  readonly change: Change | null
}

type Cred = Readonly<Record<string, string>>
type ImportedSecret = 'jiraApiToken' | 'hrmApiKey' | 'adoPat'

const ERROR_TEXT: Readonly<Record<ImportErrorCode, string>> = {
  workdayFileInvalid: 'a Workday data file is not valid; fix or move it, then run again',
  badPort: 'WORKDAY_PORT is not a port number',
  serverRunning: 'the Workday server is running; stop the Workday server first',
  notWpfFolder: 'the --from folder has no valid settings.json; is it the NOIS Workday folder?',
  passwordMissing: 'set WORKDAY_IMPORT_PASSWORD or run in a terminal to type the password',
  credUnreadable: 'the --cred file cannot be read',
  notAnExport: 'the --cred file is not a NOIS Workday credentials export',
  wrongPassword: 'the password is wrong, or the --cred file was changed',
  backupFailed: 'a backup could not be made; nothing written',
  saveFailed: 'a file could not be written',
}

// Every Workday file the import may rewrite, checked up front so a load never renames one to .bad.
const TARGET_FILES: readonly {
  readonly file: string
  readonly parse: (raw: unknown) => unknown
}[] = [
  { file: 'config.json', parse: parseConfig },
  { file: 'queue.json', parse: parseQueue },
  { file: 'teams-posts.json', parse: parsePostIndex },
  { file: 'teams-state.json', parse: parseTeamsState },
  { file: 'suggestions.json', parse: parseSuggestionState },
  { file: 'workspace.json', parse: parseWorkspaceFile },
  { file: 'board.json', parse: parseBoard },
  { file: 'secrets.json', parse: (raw) => (isRecord(raw) ? raw : null) },
]

const HEALTH_TIMEOUT_MS = 1000

/** True when anything answers GET /api/health on 127.0.0.1:<port> within a second. */
export function isServerRunning(port: number): Promise<boolean> {
  return new Promise((done) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/api/health',
        method: 'GET',
        headers: { Host: `127.0.0.1:${String(port)}` },
        timeout: HEALTH_TIMEOUT_MS,
      },
      (response) => {
        response.resume()
        done(true)
      },
    )
    request.on('timeout', () => {
      request.destroy()
      done(false)
    })
    request.on('error', () => {
      done(false)
    })
    request.end()
  })
}

/** --from, --cred and --dry-run, paths resolved against `base`; null on a bad or missing argument. */
export function parseImportArgs(argv: readonly string[], base: string): ImportArgs | null {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        from: { type: 'string' },
        cred: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    })
    if (values.from === undefined || values.from === '') {
      return null
    }
    return {
      from: resolve(base, values.from),
      cred: values.cred === undefined ? null : resolve(base, values.cred),
      dryRun: values['dry-run'],
    }
  } catch {
    return null
  }
}

function countText(count: MergeCount): string {
  return `${String(count.added)} added, ${String(count.kept)} kept`
}

function partLines(label: string, counts: Readonly<Record<string, MergeCount>>): string[] {
  return Object.entries(counts).map(([part, count]) => `${label} ${part}: ${countText(count)}`)
}

// Undefined when the file is missing; null when it is not JSON.
function readWpf(path: string): unknown {
  return existsSync(path) ? parseWpfJson(readFileSync(path, 'utf8')) : undefined
}

function changeIf<T>(
  file: string,
  before: T,
  after: T,
  save: (value: T) => Promise<void>,
): Change | null {
  return JSON.stringify(before) === JSON.stringify(after) ? null : { file, save: () => save(after) }
}

function stampOf(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  )
}

function fileSection<T>(
  label: string,
  file: string,
  raw: unknown,
  before: T,
  merge: (existing: T, raw: unknown) => { readonly value: T; readonly count: MergeCount },
  save: (value: T) => Promise<void>,
): Section {
  if (raw === undefined) {
    return { lines: [`${label}: skipped (no ${file} in the WPF folder)`], change: null }
  }
  if (raw === null) {
    return { lines: [`${label}: skipped (the WPF ${file} is not valid JSON)`], change: null }
  }
  const merged = merge(before, raw)
  return {
    lines: [`${label}: ${countText(merged.count)}`],
    change: changeIf(file, before, merged.value, save),
  }
}

function settingsSections(dataDir: string, settings: unknown, config: WorkdayConfig): Section[] {
  const teams = loadTeamsState(dataDir)
  const teamsMerged = mergeTeamsState(teams, settings)
  const suggestions = loadSuggestionState(dataDir)
  const hidden = mergeHiddenSuggestions(suggestions.hiddenKeys, settings)
  const hiddenAfter = { ...suggestions, hiddenKeys: hidden.value }
  const workspace = loadWorkspace(dataDir)
  const workspaceMerged = mergeWorkspace(workspace, settings)
  const devRepo = mergeDevRepoPath(config.workspace.devRepoPath, settings)
  const configAfter = { ...config, workspace: { ...config.workspace, devRepoPath: devRepo.value } }
  return [
    {
      lines: partLines('teams', teamsMerged.counts),
      change: changeIf('teams-state.json', teams, teamsMerged.value, (value) =>
        saveTeamsState(dataDir, value),
      ),
    },
    {
      lines: [`hidden suggestions: ${countText(hidden.count)}`],
      change: changeIf('suggestions.json', suggestions, hiddenAfter, (value) =>
        saveSuggestionState(dataDir, value),
      ),
    },
    {
      lines: partLines('workspace', workspaceMerged.counts),
      change: changeIf('workspace.json', workspace, workspaceMerged.value, (value) =>
        saveWorkspace(dataDir, value),
      ),
    },
    {
      lines: [`devRepoPath: ${countText(devRepo.count)}`],
      change: changeIf('config.json', config, configAfter, (value) => saveConfig(dataDir, value)),
    },
  ]
}

function boardSection(dataDir: string, from: string): Section {
  const tasks = join(from, 'tasks')
  if (!existsSync(tasks)) {
    return { lines: ['board: skipped (no tasks folder in the WPF folder)'], change: null }
  }
  // A missing or broken file reads as null, which mergeBoard treats as empty.
  const read = (name: string): unknown => readWpf(join(tasks, name)) ?? null
  const board = loadBoard(dataDir)
  const merged = mergeBoard(board, {
    pending: read('.jira-pending-queue.json'),
    started: read('.jira-started-tickets.json'),
    done: read('.jira-done-tickets.json'),
    dismissed: read('.jira-dismissed-tickets.json'),
    seen: read('.jira-assignment-seen.json'),
  })
  return {
    lines: partLines('board', merged.counts),
    change: changeIf('board.json', board, merged.value, (value) => saveBoard(dataDir, value)),
  }
}

function sameJiraUrl(left: string, right: string): boolean {
  try {
    const normalize = (url: string): string => {
      const parsed = new URL(url.trim())
      return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`
    }
    return normalize(left) === normalize(right)
  } catch {
    return false
  }
}

// The config gate for one secret: null when it may be imported, else the skip reason.
function gateOf(name: ImportedSecret, config: WorkdayConfig, cred: Cred): string | null {
  if (name === 'hrmApiKey') {
    return config.timesheet.hrm === null ? 'no HRM config' : null
  }
  if (name === 'adoPat') {
    return config.azureDevOps === null ? 'no Azure DevOps config' : null
  }
  if (config.jira === null) {
    return 'no Jira config'
  }
  const baseUrl = cred['JIRA_BASE_URL']
  if (baseUrl === undefined || baseUrl === '') {
    return 'no Jira URL in the export'
  }
  if (!sameJiraUrl(baseUrl, config.jira.baseUrl)) {
    return 'Jira URL differs'
  }
  const email = cred['JIRA_EMAIL']
  const sameEmail =
    email === undefined ||
    email === '' ||
    email.trim().toLowerCase() === config.jira.email.trim().toLowerCase()
  return sameEmail ? null : 'Jira email differs'
}

const SECRET_SOURCES: readonly {
  readonly name: ImportedSecret
  readonly exportKey: string
  readonly variable: string
}[] = [
  { name: 'jiraApiToken', exportKey: 'JIRA_API_TOKEN', variable: TOKEN_ENVIRONMENT_VARIABLE },
  { name: 'hrmApiKey', exportKey: 'HRM_API_KEY', variable: HRM_KEY_ENVIRONMENT_VARIABLE },
  { name: 'adoPat', exportKey: 'AZURE_DEVOPS_PAT', variable: ADO_PAT_ENVIRONMENT_VARIABLE },
]

// The report names each secret and its verdict, never the value.
function secretsSection(
  dataDir: string,
  config: WorkdayConfig,
  cred: Cred | null,
  environment: NodeJS.ProcessEnv,
): Section {
  if (cred === null) {
    return { lines: ['secrets: skipped (no --cred file)'], change: null }
  }
  const read = peekFileSecrets(dataDir, environment)
  if (read === 'noKey' || read === 'invalid') {
    const reason = read === 'noKey' ? 'no master.key' : 'secrets.json is not valid'
    return { lines: [`secrets: skipped (${reason})`], change: null }
  }
  // saveSecrets would write an undecryptable value back as null, so such a file is never rewritten.
  const locked = read.undecryptable.length !== 0
  const verdicts: string[] = []
  let after: Secrets = read.secrets
  for (const { name, exportKey, variable } of SECRET_SOURCES) {
    const value = cred[exportKey]
    const gate = gateOf(name, config, cred)
    const environmentValue = environment[variable]
    if (read.undecryptable.includes(name)) {
      verdicts.push(`${name} kept (cannot decrypt)`)
    } else if (value === undefined || value === '') {
      verdicts.push(`${name} skipped (not in the export)`)
    } else if (gate !== null) {
      verdicts.push(`${name} skipped (${gate})`)
    } else if (read.secrets[name] !== null) {
      verdicts.push(`${name} kept`)
    } else if (environmentValue !== undefined && environmentValue !== '') {
      verdicts.push(`${name} env (${variable} is set)`)
    } else if (locked) {
      verdicts.push(`${name} skipped (secrets.json has values that cannot be decrypted)`)
    } else {
      verdicts.push(`${name} added`)
      after = { ...after, [name]: value }
    }
  }
  return {
    lines: [`secrets: ${verdicts.join(', ')}`],
    change: changeIf('secrets.json', read.secrets, after, (value) => saveSecrets(dataDir, value)),
  }
}

function openCred(path: string, password: string | null): Cred | ImportErrorCode {
  if (password === null || password === '') {
    return 'passwordMissing'
  }
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return 'credUnreadable'
  }
  try {
    return openNwcred(text, password)
  } catch (error) {
    if (error instanceof NwcredError) {
      return error.code
    }
    throw error
  }
}

// Backs up every existing target, then saves file by file; a failure names what was already written.
async function writeChanges(
  dataDir: string,
  changes: readonly Change[],
  stamp: string,
  log: (line: string) => void,
): Promise<ImportResult> {
  for (const { file } of changes) {
    const path = join(dataDir, file)
    try {
      if (existsSync(path)) {
        copyFileSync(path, `${path}.before-import-${stamp}`)
      }
    } catch {
      log(`error: ${ERROR_TEXT.backupFailed}: ${file}`)
      return { exitCode: 1, error: 'backupFailed' }
    }
  }
  const written: string[] = []
  for (const change of changes) {
    try {
      await change.save()
    } catch {
      log(`error: ${ERROR_TEXT.saveFailed}`)
      const done = written.length === 0 ? 'nothing' : written.join(', ')
      log(`wrote ${done}; failed on ${change.file}; backups *.before-import-${stamp}`)
      return { exitCode: 1, error: 'saveFailed' }
    }
    written.push(change.file)
  }
  log(`wrote ${written.join(', ')}; backups *.before-import-${stamp}`)
  return { exitCode: 0, error: null }
}

// Every check that can refuse the run, in order; none of them writes.
async function preflight(
  options: ImportOptions,
  environment: NodeJS.ProcessEnv,
  fail: (error: ImportErrorCode, detail?: string) => ImportResult,
): Promise<ImportResult | { readonly settings: unknown; readonly cred: Cred | null }> {
  const { dataDir, from } = options
  const invalid = TARGET_FILES.find(
    ({ file, parse }) => !isValidJsonFile(join(dataDir, file), parse),
  )
  if (invalid !== undefined) {
    return fail('workdayFileInvalid', invalid.file)
  }
  let port: number
  try {
    port = readPort(loadConfig(dataDir).port, environment)
  } catch {
    return fail('badPort')
  }
  if (await (options.isServerRunning ?? isServerRunning)(port)) {
    return fail('serverRunning')
  }
  const settings = readWpf(join(from, 'settings.json'))
  if (settings === undefined || settings === null) {
    return fail('notWpfFolder')
  }
  if (options.cred === null) {
    return { settings, cred: null }
  }
  const opened = openCred(options.cred, await options.readPassword())
  return typeof opened === 'string' ? fail(opened) : { settings, cred: opened }
}

/** Fills Workday's data dir from a NOIS Workday folder; every check runs before the first write. */
export async function importWpf(options: ImportOptions): Promise<ImportResult> {
  const { dataDir, from, log } = options
  const environment = options.environment ?? process.env
  const fail = (error: ImportErrorCode, detail?: string): ImportResult => {
    log(`error: ${ERROR_TEXT[error]}${detail === undefined ? '' : `: ${detail}`}`)
    return { exitCode: 1, error }
  }
  const checked = await preflight(options, environment, fail)
  if ('exitCode' in checked) {
    return checked
  }
  if (existsSync(join(from, 'running'))) {
    log('warning: NOIS Workday may be running; quit it so it does not keep writing')
  }
  const config = loadConfig(dataDir)
  const sections: Section[] = [
    fileSection(
      'queue',
      'queue.json',
      readWpf(join(from, 'queue.json')),
      loadQueue(dataDir),
      mergeQueue,
      (value) => saveQueue(dataDir, value),
    ),
    fileSection(
      'teams posts',
      'teams-posts.json',
      readWpf(join(from, 'teams-posts.json')),
      loadPostIndex(dataDir),
      mergePostIndex,
      (value) => savePostIndex(dataDir, value),
    ),
    ...settingsSections(dataDir, checked.settings, config),
    boardSection(dataDir, from),
    secretsSection(dataDir, config, checked.cred, environment),
  ]
  sections.flatMap((section) => section.lines).forEach(log)
  const changes = sections.flatMap((section) => (section.change === null ? [] : [section.change]))
  if (changes.length === 0) {
    log('nothing to write')
    return { exitCode: 0, error: null }
  }
  if (options.dryRun) {
    log(`dry run: would write ${changes.map((change) => change.file).join(', ')}; nothing written`)
    return { exitCode: 0, error: null }
  }
  return writeChanges(dataDir, changes, stampOf(options.now ?? new Date()), log)
}
