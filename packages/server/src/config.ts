import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseColumns,
  type HrmConfig,
  type JiraConfig,
  type JiraTokenSource,
  type RemoteConfig,
  type StatusFlow,
  type TimesheetConfig,
  type TscConfig,
  type WorkdayConfig,
} from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from './jsonFile.js'
import { loadMasterKey, openSecret, sealSecret, SEALED_PREFIX } from './security/secretBox.js'

export interface Secrets {
  readonly jiraApiToken: string | null
  readonly hrmApiKey: string | null
  readonly tunnelToken: string | null
  readonly vapidPrivateKey: string | null
}

type SecretName = keyof Secrets

export const NO_SECRETS: Secrets = {
  jiraApiToken: null,
  hrmApiKey: null,
  tunnelToken: null,
  vapidPrivateKey: null,
}

export interface TunnelToken {
  readonly token: string | null
  readonly source: 'env' | 'file' | null
}

export interface JiraToken {
  readonly token: string | null
  readonly source: JiraTokenSource
}

const CONFIG_FILE = 'config.json'
const SECRETS_FILE = 'secrets.json'
export interface HrmKey {
  readonly key: string | null
  readonly source: 'env' | 'file' | null
}

const TOKEN_ENVIRONMENT_VARIABLE = 'WORKDAY_JIRA_API_TOKEN'
const HRM_KEY_ENVIRONMENT_VARIABLE = 'WORKDAY_HRM_API_KEY'
const TUNNEL_TOKEN_ENVIRONMENT_VARIABLE = 'WORKDAY_TUNNEL_TOKEN'
const GRAPH_TOKEN_ENVIRONMENT_VARIABLE = 'WORKDAY_MS_GRAPH_TOKEN'
const DEFAULT_POLL_MINUTES = 5
const MIN_POLL_MINUTES = 1
const MAX_POLL_MINUTES = 60
const OWNER_ONLY_MODE = 0o600

const DEFAULT_JIRA_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
const DEFAULT_MINE_JQL = 'assignee = currentUser() OR assignee WAS currentUser()'
const DEFAULT_MAX_RESULTS = 50
const DEFAULT_LOG_TIME = '18:00'
const LOG_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const DEFAULT_HEADER_ROWS = 2
export const DEFAULT_OFF_MARKER = 'OFF'
const DEFAULT_OFF_FILL_COLOR = '#FFFF00'

function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function wholeNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function stringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string')
}

function parseStatusFlow(raw: unknown): StatusFlow {
  const source = isRecord(raw) ? raw : {}
  return {
    preWorkStatuses: stringList(source['preWorkStatuses']),
    reworkStatuses: stringList(source['reworkStatuses']),
  }
}

// Not connected (null) until the three required values are all present.
export function parseJira(raw: unknown): JiraConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const baseUrl = textOrNull(raw['baseUrl'])
  const email = textOrNull(raw['email'])
  const projectKey = textOrNull(raw['projectKey'])
  if (baseUrl === null || email === null || projectKey === null) {
    return null
  }
  return {
    baseUrl,
    email,
    projectKey,
    assignedJql: textOr(raw['assignedJql'], DEFAULT_JIRA_JQL),
    mineJql: textOr(raw['mineJql'], DEFAULT_MINE_JQL),
    maxResults: wholeNumberOr(raw['maxResults'], DEFAULT_MAX_RESULTS),
    etaFieldId: textOrNull(raw['etaFieldId']),
    devPriorityFieldId: textOrNull(raw['devPriorityFieldId']),
    statusFlow: parseStatusFlow(raw['statusFlow']),
  }
}

function parseHrm(raw: unknown): HrmConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const mcpUrl = textOrNull(raw['mcpUrl'])
  const projectId = textOrNull(raw['projectId'])
  return mcpUrl === null || projectId === null ? null : { mcpUrl, projectId }
}

// Accepts "M, J" or ["M", "J"].
function parseColumnList(value: unknown): readonly string[] {
  if (typeof value === 'string') {
    return parseColumns(value)
  }
  return parseColumns(stringList(value).join(','))
}

function parseTsc(raw: unknown): TscConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const shareUrl = textOrNull(raw['shareUrl'])
  const worksheetPattern = textOrNull(raw['worksheetPattern'])
  const columns = parseColumnList(raw['columns'])
  const tokenPages = stringList(raw['tokenPages']).filter((page) => page !== '')
  if (
    shareUrl === null ||
    worksheetPattern === null ||
    columns.length === 0 ||
    tokenPages.length === 0
  ) {
    return null
  }
  const headerRows = raw['headerRows']
  return {
    shareUrl,
    worksheetPattern,
    columns,
    headerRows:
      typeof headerRows === 'number' && Number.isInteger(headerRows) && headerRows >= 0
        ? headerRows
        : DEFAULT_HEADER_ROWS,
    offMarker: textOr(raw['offMarker'], DEFAULT_OFF_MARKER),
    offFillColor: textOr(raw['offFillColor'], DEFAULT_OFF_FILL_COLOR),
    tokenPages,
    driveId: textOrNull(raw['driveId']),
    itemId: textOrNull(raw['itemId']),
  }
}

// hrm and tsc are null (not connected) until their required values are all present.
export function parseTimesheet(raw: unknown): TimesheetConfig {
  const source = isRecord(raw) ? raw : {}
  const logTime = source['logTime']
  return {
    logTime:
      typeof logTime === 'string' && LOG_TIME_PATTERN.test(logTime) ? logTime : DEFAULT_LOG_TIME,
    hrm: parseHrm(source['hrm']),
    tsc: parseTsc(source['tsc']),
  }
}

export function isLogTime(value: unknown): value is string {
  return typeof value === 'string' && LOG_TIME_PATTERN.test(value)
}

function parsePollMinutes(value: unknown): number {
  const isInRange =
    typeof value === 'number' && value >= MIN_POLL_MINUTES && value <= MAX_POLL_MINUTES
  return isInRange ? value : DEFAULT_POLL_MINUTES
}

function parseConfig(raw: unknown): WorkdayConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  return {
    host: textOr(raw['host'], DEFAULT_CONFIG.host),
    port: wholeNumberOr(raw['port'], DEFAULT_CONFIG.port),
    timeZone: textOr(raw['timeZone'], DEFAULT_CONFIG.timeZone),
    pollMinutes: parsePollMinutes(raw['pollMinutes']),
    theme: raw['theme'] === 'light' ? 'light' : 'dark',
    language: raw['language'] === 'vi' ? 'vi' : 'en',
    jira: parseJira(raw['jira']),
    timesheet: parseTimesheet(raw['timesheet']),
    remote: parseRemote(raw['remote']),
  }
}

// All three values are required; a pasted URL is reduced to its host.
export function parseRemote(raw: unknown): RemoteConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const publicHost = textOrNull(raw['publicHost'])
    ?.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  const accessTeamDomain = textOrNull(raw['accessTeamDomain'])
  const accessAud = textOrNull(raw['accessAud'])
  if (
    publicHost === undefined ||
    publicHost === '' ||
    accessTeamDomain === null ||
    accessAud === null
  ) {
    return null
  }
  return {
    enabled: raw['enabled'] === true,
    publicHost,
    accessTeamDomain,
    accessAud,
    cloudflaredPath: textOrNull(raw['cloudflaredPath']),
  }
}

const DEFAULT_CONFIG: WorkdayConfig = {
  host: '127.0.0.1',
  port: 4870,
  timeZone: 'Asia/Ho_Chi_Minh',
  pollMinutes: DEFAULT_POLL_MINUTES,
  theme: 'dark',
  language: 'en',
  jira: null,
  timesheet: { logTime: DEFAULT_LOG_TIME, hrm: null, tsc: null },
  remote: null,
}

export function loadConfig(dataDir: string): WorkdayConfig {
  return readJson(join(dataDir, CONFIG_FILE), parseConfig, DEFAULT_CONFIG)
}

export async function saveConfig(dataDir: string, config: WorkdayConfig): Promise<void> {
  await writeJsonAtomic(join(dataDir, CONFIG_FILE), config)
}

function secretsFileMode(): number | undefined {
  return process.platform === 'win32' ? undefined : OWNER_ONLY_MODE
}

function sealSecrets(key: Buffer, secrets: Secrets): Record<SecretName, string | null> {
  const seal = (value: string | null): string | null =>
    value === null ? null : sealSecret(key, value)
  return {
    jiraApiToken: seal(secrets.jiraApiToken),
    hrmApiKey: seal(secrets.hrmApiKey),
    tunnelToken: seal(secrets.tunnelToken),
    vapidPrivateKey: seal(secrets.vapidPrivateKey),
  }
}

// The file's own values, ignoring the environment overrides. A plain-text file is sealed once.
export function readFileSecrets(dataDir: string): Secrets {
  const key = loadMasterKey(dataDir)
  const found = { plainValue: false }
  const parse = (raw: unknown): Secrets | null => {
    if (!isRecord(raw)) {
      return null
    }
    const read = (name: SecretName): string | null => {
      const stored = textOrNull(raw[name])
      if (stored === null) {
        return null
      }
      if (stored.startsWith(SEALED_PREFIX)) {
        const opened = openSecret(key, stored)
        if (opened === null) {
          console.warn(`Ignoring ${name} in ${SECRETS_FILE}: it cannot be decrypted`)
        }
        return opened
      }
      found.plainValue = true
      return stored
    }
    return {
      jiraApiToken: read('jiraApiToken'),
      hrmApiKey: read('hrmApiKey'),
      tunnelToken: read('tunnelToken'),
      vapidPrivateKey: read('vapidPrivateKey'),
    }
  }
  const path = join(dataDir, SECRETS_FILE)
  const secrets = readJson(path, parse, NO_SECRETS)
  if (found.plainValue) {
    rewriteSealed(path, key, secrets)
  }
  return secrets
}

function rewriteSealed(path: string, key: Buffer, secrets: Secrets): void {
  try {
    const temporaryPath = `${path}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(sealSecrets(key, secrets), null, 2), {
      mode: secretsFileMode(),
    })
    renameSync(temporaryPath, path)
  } catch {
    console.warn(`Could not re-encrypt ${SECRETS_FILE}; it stays as it was`)
  }
}

// The environment variable wins over secrets.json.
export function loadJiraToken(dataDir: string): JiraToken {
  const environmentToken = textOrNull(process.env[TOKEN_ENVIRONMENT_VARIABLE])
  if (environmentToken !== null) {
    return { token: environmentToken, source: 'env' }
  }
  const fileToken = readFileSecrets(dataDir).jiraApiToken
  return { token: fileToken, source: fileToken === null ? null : 'file' }
}

// The environment variable wins over secrets.json.
export function loadHrmKey(dataDir: string): HrmKey {
  const environmentKey = textOrNull(process.env[HRM_KEY_ENVIRONMENT_VARIABLE])
  if (environmentKey !== null) {
    return { key: environmentKey, source: 'env' }
  }
  const fileKey = readFileSecrets(dataDir).hrmApiKey
  return { key: fileKey, source: fileKey === null ? null : 'file' }
}

// Environment only: a short-lived Graph token is never written to disk.
export function loadGraphTokenOverride(): string | null {
  return textOrNull(process.env[GRAPH_TOKEN_ENVIRONMENT_VARIABLE])
}

// The environment variable wins over secrets.json.
export function loadTunnelToken(dataDir: string): TunnelToken {
  const environmentToken = textOrNull(process.env[TUNNEL_TOKEN_ENVIRONMENT_VARIABLE])
  if (environmentToken !== null) {
    return { token: environmentToken, source: 'env' }
  }
  const fileToken = readFileSecrets(dataDir).tunnelToken
  return { token: fileToken, source: fileToken === null ? null : 'file' }
}

export function loadSecrets(dataDir: string): Secrets {
  return {
    jiraApiToken: loadJiraToken(dataDir).token,
    hrmApiKey: loadHrmKey(dataDir).key,
    tunnelToken: loadTunnelToken(dataDir).token,
    vapidPrivateKey: readFileSecrets(dataDir).vapidPrivateKey,
  }
}

export async function saveSecrets(dataDir: string, secrets: Secrets): Promise<void> {
  const sealed = sealSecrets(loadMasterKey(dataDir), secrets)
  await writeJsonAtomic(join(dataDir, SECRETS_FILE), sealed, secretsFileMode())
}
