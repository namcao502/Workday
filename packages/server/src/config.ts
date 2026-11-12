import { join } from 'node:path'
import type { JiraConfig, JiraTokenSource, StatusFlow, WorkdayConfig } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from './jsonFile.js'

export interface Secrets {
  readonly jiraApiToken: string | null
}

export interface JiraToken {
  readonly token: string | null
  readonly source: JiraTokenSource
}

const CONFIG_FILE = 'config.json'
const SECRETS_FILE = 'secrets.json'
const TOKEN_ENVIRONMENT_VARIABLE = 'WORKDAY_JIRA_API_TOKEN'
const DEFAULT_POLL_MINUTES = 5
const MIN_POLL_MINUTES = 1
const MAX_POLL_MINUTES = 60
const OWNER_ONLY_MODE = 0o600

const DEFAULT_JIRA_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
const DEFAULT_MAX_RESULTS = 50

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
    maxResults: wholeNumberOr(raw['maxResults'], DEFAULT_MAX_RESULTS),
    etaFieldId: textOrNull(raw['etaFieldId']),
    devPriorityFieldId: textOrNull(raw['devPriorityFieldId']),
    statusFlow: parseStatusFlow(raw['statusFlow']),
  }
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
  }
}

function parseSecrets(raw: unknown): Secrets | null {
  if (!isRecord(raw)) {
    return null
  }
  return { jiraApiToken: textOrNull(raw['jiraApiToken']) }
}

const DEFAULT_CONFIG: WorkdayConfig = {
  host: '127.0.0.1',
  port: 4870,
  timeZone: 'Asia/Ho_Chi_Minh',
  pollMinutes: DEFAULT_POLL_MINUTES,
  theme: 'dark',
  language: 'en',
  jira: null,
}

export function loadConfig(dataDir: string): WorkdayConfig {
  return readJson(join(dataDir, CONFIG_FILE), parseConfig, DEFAULT_CONFIG)
}

export async function saveConfig(dataDir: string, config: WorkdayConfig): Promise<void> {
  await writeJsonAtomic(join(dataDir, CONFIG_FILE), config)
}

// The environment variable wins over secrets.json.
export function loadJiraToken(dataDir: string): JiraToken {
  const environmentToken = textOrNull(process.env[TOKEN_ENVIRONMENT_VARIABLE])
  if (environmentToken !== null) {
    return { token: environmentToken, source: 'env' }
  }
  const fileSecrets = readJson(join(dataDir, SECRETS_FILE), parseSecrets, { jiraApiToken: null })
  const fileToken = fileSecrets.jiraApiToken
  return { token: fileToken, source: fileToken === null ? null : 'file' }
}

export function loadSecrets(dataDir: string): Secrets {
  return { jiraApiToken: loadJiraToken(dataDir).token }
}

export async function saveSecrets(dataDir: string, secrets: Secrets): Promise<void> {
  const mode = process.platform === 'win32' ? undefined : OWNER_ONLY_MODE
  await writeJsonAtomic(join(dataDir, SECRETS_FILE), secrets, mode)
}
