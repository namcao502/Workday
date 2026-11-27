import { setHash } from '../shell/appHash.js'

// Kept apart from settingsGroups.tsx so a link into Settings does not pull every Settings card into the main bundle.
export type SettingsGroupId = 'general' | 'integrations' | 'work' | 'remote' | 'guide'

export type SettingsEntryId =
  | 'appearance'
  | 'notices'
  | 'noticeRouting'
  | 'backup'
  | 'jira'
  | 'ado'
  | 'teams'
  | 'timesheet'
  | 'holidays'
  | 'workspace'
  | 'schedules'
  | 'thisDevice'
  | 'vpn'
  | 'cloudflare'
  | 'devices'
  | 'guide'

// A group opens its first entry.
export function navigateToSettings(target: SettingsGroupId | SettingsEntryId): void {
  setHash(`#/settings/${target}`)
}
