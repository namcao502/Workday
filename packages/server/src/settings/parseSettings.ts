import type {
  AdoCheckRequest,
  AzureDevOpsConfig,
  JiraCheckRequest,
  JiraConfig,
  RemoteConfig,
  SettingsUpdate,
  TimesheetConfig,
} from '@workday/core'
import {
  isLogTime,
  parseAzureDevOps,
  parseTeams,
  parseJira,
  parseNotices,
  parseRemote,
  parseTimesheet,
  parseWorkspace,
} from '../config.js'
import { isRecord } from '../jsonFile.js'

const MIN_PORT = 1024
const MAX_PORT = 65535
const MIN_POLL_MINUTES = 1
const MAX_POLL_MINUTES = 60

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function isValidTimeZone(value: unknown): value is string {
  if (!isNonEmptyText(value)) {
    return false
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

// undefined = invalid; null = disconnect.
function parseJiraField(raw: unknown): JiraConfig | null | undefined {
  if (raw === null) {
    return null
  }
  const jira = parseJira(raw)
  return jira !== null && isHttpUrl(jira.baseUrl) ? jira : undefined
}

// undefined = invalid; null = disconnect. A block without organization or project is invalid.
function parseAzureDevOpsField(raw: unknown): AzureDevOpsConfig | null | undefined {
  if (raw === null) {
    return null
  }
  return parseAzureDevOps(raw) ?? undefined
}

// undefined = invalid; null = remote access not configured. A string field of the wrong type is invalid too.
function parseRemoteField(raw: unknown): RemoteConfig | null | undefined {
  if (raw === null) {
    return null
  }
  if (!isRecord(raw)) {
    return undefined
  }
  const { enabled, cloudflaredPath } = raw
  const isEnabledValid = enabled === undefined || typeof enabled === 'boolean'
  const isPathValid =
    cloudflaredPath === undefined || cloudflaredPath === null || typeof cloudflaredPath === 'string'
  const remote = parseRemote(raw)
  return remote !== null && isEnabledValid && isPathValid ? remote : undefined
}

export interface HrmCheckRequest {
  readonly mcpUrl: string
  readonly hrmApiKey?: string
}

// The whole block is replaced, so logTime is required; an incomplete hrm or tsc reads as not connected.
function parseTimesheetField(raw: unknown): TimesheetConfig | undefined {
  if (!isRecord(raw) || !isLogTime(raw['logTime'])) {
    return undefined
  }
  const timesheet = parseTimesheet(raw)
  return timesheet.hrm === null || isHttpUrl(timesheet.hrm.mcpUrl) ? timesheet : undefined
}

// Null when any field it carries is invalid; unknown fields (host included) are ignored.
export function parseSettingsUpdate(raw: unknown): SettingsUpdate | null {
  if (!isRecord(raw)) {
    return null
  }
  let update: SettingsUpdate = {}
  const { port, timeZone, pollMinutes, theme, language, jiraApiToken, hrmApiKey, tunnelToken } = raw
  const { adoPat } = raw
  if (port !== undefined) {
    if (!isIntegerBetween(port, MIN_PORT, MAX_PORT)) {
      return null
    }
    update = { ...update, port }
  }
  if (timeZone !== undefined) {
    if (!isValidTimeZone(timeZone)) {
      return null
    }
    update = { ...update, timeZone }
  }
  if (pollMinutes !== undefined) {
    if (!isIntegerBetween(pollMinutes, MIN_POLL_MINUTES, MAX_POLL_MINUTES)) {
      return null
    }
    update = { ...update, pollMinutes }
  }
  if (theme !== undefined) {
    if (theme !== 'dark' && theme !== 'light') {
      return null
    }
    update = { ...update, theme }
  }
  if (language !== undefined) {
    if (language !== 'en' && language !== 'vi') {
      return null
    }
    update = { ...update, language }
  }
  if (Object.hasOwn(raw, 'jira')) {
    const jira = parseJiraField(raw['jira'])
    if (jira === undefined) {
      return null
    }
    update = { ...update, jira }
  }
  if (jiraApiToken !== undefined) {
    if (!isNonEmptyText(jiraApiToken)) {
      return null
    }
    update = { ...update, jiraApiToken }
  }
  if (raw['timesheet'] !== undefined) {
    const timesheet = parseTimesheetField(raw['timesheet'])
    if (timesheet === undefined) {
      return null
    }
    update = { ...update, timesheet }
  }
  if (hrmApiKey !== undefined) {
    if (!isNonEmptyText(hrmApiKey)) {
      return null
    }
    update = { ...update, hrmApiKey }
  }
  if (Object.hasOwn(raw, 'remote')) {
    const remote = parseRemoteField(raw['remote'])
    if (remote === undefined) {
      return null
    }
    update = { ...update, remote }
  }
  if (tunnelToken !== undefined) {
    if (!isNonEmptyText(tunnelToken)) {
      return null
    }
    update = { ...update, tunnelToken }
  }
  if (raw['workspace'] !== undefined) {
    if (!isRecord(raw['workspace'])) {
      return null
    }
    update = { ...update, workspace: parseWorkspace(raw['workspace']) }
  }
  if (Object.hasOwn(raw, 'azureDevOps')) {
    const azureDevOps = parseAzureDevOpsField(raw['azureDevOps'])
    if (azureDevOps === undefined) {
      return null
    }
    update = { ...update, azureDevOps }
  }
  if (raw['teams'] !== undefined) {
    if (!isRecord(raw['teams'])) {
      return null
    }
    update = { ...update, teams: parseTeams(raw['teams']) }
  }
  if (adoPat !== undefined) {
    if (!isNonEmptyText(adoPat)) {
      return null
    }
    update = { ...update, adoPat }
  }
  if (raw['notices'] !== undefined) {
    if (!isRecord(raw['notices'])) {
      return null
    }
    update = { ...update, notices: parseNotices(raw['notices']) }
  }
  return update
}

export function parseAdoCheckRequest(raw: unknown): AdoCheckRequest | null {
  if (!isRecord(raw)) {
    return null
  }
  const { organization, project, adoPat } = raw
  if (!isNonEmptyText(organization) || !isNonEmptyText(project)) {
    return null
  }
  if (adoPat === undefined) {
    return { organization, project }
  }
  return isNonEmptyText(adoPat) ? { organization, project, adoPat } : null
}

export function parseHrmCheckRequest(raw: unknown): HrmCheckRequest | null {
  if (!isRecord(raw)) {
    return null
  }
  const { mcpUrl, hrmApiKey } = raw
  if (!isNonEmptyText(mcpUrl) || !isHttpUrl(mcpUrl)) {
    return null
  }
  if (hrmApiKey === undefined) {
    return { mcpUrl }
  }
  return isNonEmptyText(hrmApiKey) ? { mcpUrl, hrmApiKey } : null
}

export function parseJiraCheckRequest(raw: unknown): JiraCheckRequest | null {
  if (!isRecord(raw)) {
    return null
  }
  const { baseUrl, email, jiraApiToken } = raw
  if (!isNonEmptyText(baseUrl) || !isHttpUrl(baseUrl) || !isNonEmptyText(email)) {
    return null
  }
  if (jiraApiToken === undefined) {
    return { baseUrl, email }
  }
  return isNonEmptyText(jiraApiToken) ? { baseUrl, email, jiraApiToken } : null
}

export function sameBaseUrl(left: string, right: string): boolean {
  return left.replace(/\/+$/, '') === right.replace(/\/+$/, '')
}
