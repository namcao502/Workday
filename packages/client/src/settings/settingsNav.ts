import { setHash } from '../shell/appHash.js'

// Kept apart from settingsGroups.tsx so a link into Settings does not pull every Settings card into the main bundle.
export type SettingsGroupId = 'general' | 'integrations' | 'work' | 'remote' | 'guide'

export function navigateToSettings(group: SettingsGroupId): void {
  setHash(`#/settings/${group}`)
}
