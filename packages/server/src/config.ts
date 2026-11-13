import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseColumns,
  parseTime,
  SCAN_DAYS,
  SCAN_LIMIT_HOURS,
  type AgentMode,
  type KnowledgeScanConfig,
  type AzureDevOpsConfig,
  type HrmConfig,
  type JiraConfig,
  type JiraTokenSource,
  type NoticeChannels,
  type NoticePrefs,
  type NoticeTopic,
  type RemoteConfig,
  type StatusFlow,
  type SuggestionsConfig,
  type TeamsConfig,
  type TimesheetConfig,
  type TscConfig,
  type WorkdayConfig,
  type WorkspaceConfig,
} from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from './jsonFile.js'
import {
  findMasterKey,
  loadMasterKey,
  openSecret,
  sealSecret,
  SEALED_PREFIX,
} from './security/secretBox.js'

export interface Secrets {
  readonly jiraApiToken: string | null
  readonly hrmApiKey: string | null
  readonly tunnelToken: string | null
  readonly vapidPrivateKey: string | null
  readonly adoPat: string | null
}

type SecretName = keyof Secrets

export const NO_SECRETS: Secrets = {
  jiraApiToken: null,
  hrmApiKey: null,
  tunnelToken: null,
  vapidPrivateKey: null,
  adoPat: null,
}

export interface TunnelToken {
  readonly token: string | null
  readonly source: 'env' | 'file' | null
}

export interface JiraToken {
  readonly token: string | null
  readonly source: JiraTokenSource
}

export interface AdoPat {
  readonly pat: string | null
  readonly source: 'env' | 'file' | null
}

const CONFIG_FILE = 'config.json'
const SECRETS_FILE = 'secrets.json'
export interface HrmKey {
  readonly key: string | null
  readonly source: 'env' | 'file' | null
}

export const TOKEN_ENVIRONMENT_VARIABLE = 'WORKDAY_JIRA_API_TOKEN'
export const HRM_KEY_ENVIRONMENT_VARIABLE = 'WORKDAY_HRM_API_KEY'
const TUNNEL_TOKEN_ENVIRONMENT_VARIABLE = 'WORKDAY_TUNNEL_TOKEN'
export const ADO_PAT_ENVIRONMENT_VARIABLE = 'WORKDAY_ADO_PAT'
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
    readyToTestPath: stringList(source['readyToTestPath']),
    developerStatuses: stringList(source['developerStatuses']),
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
    suggestions: parseSuggestions(raw['suggestions']),
  }
}

// All four JQL/prefix values are required; a partial block reads as suggestions off.
function parseSuggestions(raw: unknown): SuggestionsConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const epicJql = textOrNull(raw['epicJql'])
  const epicTitlePrefix = textOrNull(raw['epicTitlePrefix'])
  const candidatesJql = textOrNull(raw['candidatesJql'])
  const mineJql = textOrNull(raw['mineJql'])
  if (epicJql === null || epicTitlePrefix === null || candidatesJql === null || mineJql === null) {
    return null
  }
  return {
    epicJql,
    epicTitlePrefix,
    candidatesJql,
    mineJql,
    selectedStatus: textOrNull(raw['selectedStatus']),
  }
}

// Null until organization and project are both present; repoLabels keeps the file's key order.
export function parseAzureDevOps(raw: unknown): AzureDevOpsConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const organization = textOrNull(raw['organization'])
  const project = textOrNull(raw['project'])
  if (organization === null || project === null) {
    return null
  }
  const repoLabels: Record<string, string> = {}
  const rawLabels = raw['repoLabels']
  if (isRecord(rawLabels)) {
    for (const [repository, label] of Object.entries(rawLabels)) {
      const text = textOrNull(label)
      if (text !== null) {
        repoLabels[repository] = text
      }
    }
  }
  return {
    organization,
    project,
    repoLabels,
    devPipelineFolder: textOrNull(raw['devPipelineFolder']),
  }
}

// Only "Team > Channel" lines count; no valid line means Teams is off.
export function parseTeams(raw: unknown): TeamsConfig {
  const record = isRecord(raw) ? raw : {}
  const lines = record['watchedChannels']
  const watchedChannels = Array.isArray(lines)
    ? lines.filter((line): line is string => typeof line === 'string' && line.includes('>'))
    : []
  return {
    watchedChannels,
    postLeadName: textOrNull(record['postLeadName']),
    postGreeting: textOrNull(record['postGreeting']),
  }
}

// Null when the command, day, time or limit is not valid, so a bad file or request never half-applies.
export function parseKnowledgeScan(raw: unknown): KnowledgeScanConfig | null {
  if (!isRecord(raw)) {
    return null
  }
  const { enabled, command, args, day, time, limitHours, logFile } = raw
  const isValid =
    typeof enabled === 'boolean' &&
    typeof command === 'string' &&
    command.trim() !== '' &&
    Array.isArray(args) &&
    args.every((arg) => typeof arg === 'string') &&
    typeof day === 'string' &&
    SCAN_DAYS.some((choice) => choice === day) &&
    typeof time === 'string' &&
    parseTime(time) !== null &&
    SCAN_LIMIT_HOURS.some((choice) => choice === limitHours) &&
    (logFile === undefined || logFile === null || typeof logFile === 'string')
  if (!isValid) {
    return null
  }
  return {
    enabled,
    command: command.trim(),
    args: stringList(args),
    day: day as KnowledgeScanConfig['day'],
    time,
    limitHours: limitHours as KnowledgeScanConfig['limitHours'],
    logFile: textOrNull(logFile),
  }
}

const NOTICE_TOPICS: readonly NoticeTopic[] = [
  'claude',
  'pr',
  'jira',
  'suggestions',
  'teams',
  'teamsMention',
  'knowledge',
  'other',
]
const NOTICE_CHANNELS: readonly (keyof NoticeChannels)[] = ['toast', 'desktop', 'phone']

// Unknown topics and channels, and any non-boolean value, are dropped.
export function parseNotices(raw: unknown): NoticePrefs {
  if (!isRecord(raw)) {
    return {}
  }
  const prefs: Partial<Record<NoticeTopic, Partial<NoticeChannels>>> = {}
  for (const topic of NOTICE_TOPICS) {
    const rawChannels = raw[topic]
    if (!isRecord(rawChannels)) {
      continue
    }
    const channels: Partial<Record<keyof NoticeChannels, boolean>> = {}
    for (const channel of NOTICE_CHANNELS) {
      const value = rawChannels[channel]
      if (typeof value === 'boolean') {
        channels[channel] = value
      }
    }
    prefs[topic] = channels
  }
  return prefs
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

export function parseConfig(raw: unknown): WorkdayConfig | null {
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
    workspace: parseWorkspace(raw['workspace']),
    azureDevOps: parseAzureDevOps(raw['azureDevOps']),
    teams: parseTeams(raw['teams']),
    notices: parseNotices(raw['notices']),
    knowledgeScan: parseKnowledgeScan(raw['knowledgeScan']),
  }
}

const AGENT_MODES: ReadonlySet<string> = new Set([
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
])

function agentModeOf(value: unknown): AgentMode {
  return typeof value === 'string' && AGENT_MODES.has(value) ? (value as AgentMode) : 'default'
}

// A missing or wrong-typed field takes its default; never null.
export function parseWorkspace(raw: unknown): WorkspaceConfig {
  if (!isRecord(raw)) {
    return DEFAULT_WORKSPACE
  }
  return {
    devRepoPath: textOrNull(raw['devRepoPath']),
    siblingRepoGlob: textOrNull(raw['siblingRepoGlob']),
    startPrompt: textOrNull(raw['startPrompt']),
    claudeExecutable: textOrNull(raw['claudeExecutable']),
    localOnlyPaths: stringList(raw['localOnlyPaths']).filter((path) => path !== ''),
    permissionMode: agentModeOf(raw['permissionMode']),
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

export const DEFAULT_WORKSPACE: WorkspaceConfig = {
  devRepoPath: null,
  siblingRepoGlob: null,
  startPrompt: null,
  claudeExecutable: null,
  localOnlyPaths: [],
  permissionMode: 'default',
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
  workspace: DEFAULT_WORKSPACE,
  azureDevOps: null,
  teams: { watchedChannels: [], postLeadName: null, postGreeting: null },
  notices: {},
  knowledgeScan: null,
}

export function loadConfig(dataDir: string): WorkdayConfig {
  return readJson(join(dataDir, CONFIG_FILE), parseConfig, DEFAULT_CONFIG)
}

// WORKDAY_PORT (dev only) overrides the port in config.json.
export function readPort(configPort: number, environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment['WORKDAY_PORT']
  if (raw === undefined || raw === '') return configPort
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`WORKDAY_PORT must be a port number, got "${raw}"`)
  }
  return port
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
    adoPat: seal(secrets.adoPat),
  }
}

export interface FileSecretsRead {
  readonly secrets: Secrets
  readonly undecryptable: readonly SecretName[]
  readonly plainValue: boolean
}

const SECRET_NAMES: readonly SecretName[] = [
  'jiraApiToken',
  'hrmApiKey',
  'tunnelToken',
  'vapidPrivateKey',
  'adoPat',
]

function openFileSecrets(raw: unknown, key: Buffer): FileSecretsRead | null {
  if (!isRecord(raw)) {
    return null
  }
  const undecryptable: SecretName[] = []
  const read = (name: SecretName): string | null => {
    const stored = textOrNull(raw[name])
    if (stored === null || !stored.startsWith(SEALED_PREFIX)) {
      return stored
    }
    const opened = openSecret(key, stored)
    if (opened === null) {
      undecryptable.push(name)
    }
    return opened
  }
  const secrets: Secrets = {
    jiraApiToken: read('jiraApiToken'),
    hrmApiKey: read('hrmApiKey'),
    tunnelToken: read('tunnelToken'),
    vapidPrivateKey: read('vapidPrivateKey'),
    adoPat: read('adoPat'),
  }
  const plainValue = SECRET_NAMES.some((name) => {
    const stored = textOrNull(raw[name])
    return stored !== null && !stored.startsWith(SEALED_PREFIX)
  })
  return { secrets, undecryptable, plainValue }
}

// The file's own values, ignoring the environment overrides. A plain-text file is sealed once.
export function readFileSecrets(dataDir: string): Secrets {
  const key = loadMasterKey(dataDir)
  const path = join(dataDir, SECRETS_FILE)
  const read = readJson<FileSecretsRead | null>(path, (raw) => openFileSecrets(raw, key), null)
  if (read === null) {
    return NO_SECRETS
  }
  for (const name of read.undecryptable) {
    console.warn(`Ignoring ${name} in ${SECRETS_FILE}: it cannot be decrypted`)
  }
  if (read.plainValue) {
    rewriteSealed(path, key, read.secrets)
  }
  return read.secrets
}

// Read-only twin of readFileSecrets: never creates master.key or reseals. A missing file reads empty.
export function peekFileSecrets(
  dataDir: string,
  environment: NodeJS.ProcessEnv = process.env,
): FileSecretsRead | 'noKey' | 'invalid' {
  const path = join(dataDir, SECRETS_FILE)
  if (!existsSync(path)) {
    return { secrets: NO_SECRETS, undecryptable: [], plainValue: false }
  }
  const key = findMasterKey(dataDir, environment)
  if (key === null) {
    return 'noKey'
  }
  try {
    return openFileSecrets(JSON.parse(readFileSync(path, 'utf8')), key) ?? 'invalid'
  } catch {
    return 'invalid'
  }
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

// The environment variable wins over secrets.json.
export function loadAdoPat(dataDir: string): AdoPat {
  const environmentPat = textOrNull(process.env[ADO_PAT_ENVIRONMENT_VARIABLE])
  if (environmentPat !== null) {
    return { pat: environmentPat, source: 'env' }
  }
  const filePat = readFileSecrets(dataDir).adoPat
  return { pat: filePat, source: filePat === null ? null : 'file' }
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
    adoPat: loadAdoPat(dataDir).pat,
  }
}

export async function saveSecrets(dataDir: string, secrets: Secrets): Promise<void> {
  const sealed = sealSecrets(loadMasterKey(dataDir), secrets)
  await writeJsonAtomic(join(dataDir, SECRETS_FILE), sealed, secretsFileMode())
}
