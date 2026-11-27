import type { SettingsView } from '@workday/core'
import { t } from '../i18n.js'
import { SchedulesSection } from '../schedules/SchedulesSection.js'
import { AzureDevOpsSection } from './AzureDevOpsSection.js'
import { BackupSection } from './BackupSection.js'
import { CloudflareSection } from './CloudflareSection.js'
import { ConnectionsSection } from './ConnectionsSection.js'
import { GeneralSection } from './GeneralSection.js'
import { GuideSection } from './GuideSection.js'
import { HolidaysSection } from './HolidaysSection.js'
import { NoticeRoutingSection } from './NoticeRoutingSection.js'
import { NoticesSection } from './NoticesSection.js'
import { RemoteSection } from './RemoteSection.js'
import { TeamsSection } from './TeamsSection.js'
import { TimesheetSection } from './TimesheetSection.js'
import { ThisDeviceSection } from './ThisDeviceSection.js'
import { VpnSection } from './VpnSection.js'
import { WorkspaceSection } from './WorkspaceSection.js'
import { navigateToSettings, type SettingsEntryId, type SettingsGroupId } from './settingsNav.js'

export { navigateToSettings, type SettingsEntryId, type SettingsGroupId }

// 'on' = set up and switched on, 'off' = not set up or switched off; no status = nothing to connect.
export type EntryStatus = 'on' | 'off'

export interface SettingsEntry {
  readonly id: SettingsEntryId
  readonly title: string
  readonly keywords: string // lowercase words the search also matches, beyond the title
  readonly render: (settings: SettingsView) => React.JSX.Element
  readonly status?: (settings: SettingsView) => EntryStatus
}

function onOff(on: boolean): EntryStatus {
  return on ? 'on' : 'off'
}

export interface SettingsGroup {
  readonly id: SettingsGroupId
  readonly label: string
  readonly entries: readonly SettingsEntry[]
}

export const DEFAULT_GROUP: SettingsGroupId = 'general'

// Built on each render so the labels follow the UI language; isRemote adds this device's card.
export function settingsGroups(isRemote = false): readonly SettingsGroup[] {
  const groups: readonly SettingsGroup[] = [
    {
      id: 'general',
      label: t('settings.general'),
      entries: [
        {
          id: 'appearance',
          title: t('settings.appearance'),
          keywords: 'theme dark light language english vietnamese time zone port',
          render: (settings) => <GeneralSection settings={settings} />,
        },
        {
          id: 'notices',
          title: t('settings.notices'),
          keywords: 'notification toast sound topic bell alert',
          render: (settings) => <NoticesSection settings={settings} />,
        },
        {
          id: 'noticeRouting',
          title: t('settings.phoneAndPc'),
          keywords: 'phone away idle teams presence push mobile điện thoại rời',
          render: (settings) => <NoticeRoutingSection settings={settings} />,
        },
        {
          id: 'backup',
          title: t('settings.backupMoveToAnotherPc'),
          keywords: 'backup export import restore move transfer password file machine',
          render: () => <BackupSection />,
        },
      ],
    },
    {
      id: 'integrations',
      label: t('settings.integrations'),
      entries: [
        {
          id: 'jira',
          title: 'Jira',
          keywords: 'connections url email api token project key eta dev priority jql poll',
          render: (settings) => <ConnectionsSection settings={settings} />,
          status: (settings) =>
            onOff(settings.config.jira !== null && settings.jiraTokenSource !== null),
        },
        {
          id: 'ado',
          title: 'Azure DevOps',
          keywords: 'ado pull request pr pat organization repo',
          render: (settings) => <AzureDevOpsSection settings={settings} />,
          status: (settings) =>
            onOff(settings.config.azureDevOps !== null && settings.adoPatSource !== null),
        },
        {
          id: 'teams',
          title: 'Teams',
          keywords: 'microsoft chat channel browser profile sign in',
          render: (settings) => <TeamsSection settings={settings} />,
          status: (settings) => onOff(settings.config.teams.watchedChannels.length > 0),
        },
      ],
    },
    {
      id: 'work',
      label: t('settings.work'),
      entries: [
        {
          id: 'timesheet',
          title: t('settings.timesheet2'),
          keywords: 'hrm tsc log time hours reminder sign in work log',
          render: (settings) => <TimesheetSection settings={settings} />,
          status: (settings) =>
            onOff(settings.config.timesheet.hrm !== null || settings.config.timesheet.tsc !== null),
        },
        {
          id: 'holidays',
          title: t('settings.holidays'),
          keywords: 'holiday day off tet public ngày lễ nghỉ',
          render: (settings) => <HolidaysSection settings={settings} />,
        },
        {
          id: 'workspace',
          title: t('settings.workspace'),
          keywords: 'dev repo folder worktree clean up slim claude terminal model',
          render: (settings) => <WorkspaceSection settings={settings} />,
        },
        {
          id: 'schedules',
          title: t('settings.schedules'),
          keywords: 'knowledge scan jobs cron run now in-app',
          render: () => <SchedulesSection />,
        },
      ],
    },
    {
      id: 'remote',
      label: t('settings.remoteAccess'),
      entries: [
        {
          id: 'thisDevice',
          title: t('remote.device'),
          keywords: 'this device push notifications phone',
          render: () => <ThisDeviceSection />,
        },
        {
          id: 'vpn',
          title: t('settings.vpnAccess'),
          keywords: 'vpn https certificate firewall ip range iphone',
          render: (settings) => <VpnSection settings={settings} />,
          status: (settings) => onOff(settings.config.vpn?.enabled === true),
        },
        {
          id: 'cloudflare',
          title: 'Cloudflare',
          keywords: 'tunnel cloudflared access jwt public host aud token',
          render: (settings) => <CloudflareSection settings={settings} />,
          status: (settings) => onOff(settings.config.remote?.enabled === true),
        },
        {
          id: 'devices',
          title: t('settings.devices'),
          keywords: 'remote access device pair phone mobile revoke activity',
          render: (settings) => <RemoteSection settings={settings} />,
        },
      ],
    },
    {
      id: 'guide',
      label: t('settings.guide'),
      entries: [
        {
          id: 'guide',
          title: t('settings.guide'),
          keywords: 'help how to token setup',
          render: () => <GuideSection />,
        },
      ],
    },
  ]
  return groups.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => isRemote || entry.id !== 'thisDevice'),
  }))
}

export interface SettingsLocation {
  readonly group: SettingsGroup
  readonly entry: SettingsEntry
  readonly picked: boolean // false = the hash names nothing, so the default entry stands in
}

// "#/settings/jira" opens that entry, "#/settings/work" the group's first entry; anything else the first entry.
export function settingsLocation(groups: readonly SettingsGroup[], hash: string): SettingsLocation {
  const name = hash.replace(/^#\/?/, '').split('?')[0]?.split('/')[1]
  for (const group of groups) {
    const entry = group.entries.find((candidate) => candidate.id === name)
    if (entry !== undefined) {
      return { group, entry, picked: true }
    }
  }
  const named = groups.find((group) => group.id === name)
  const group = named ?? groups.find((candidate) => candidate.id === DEFAULT_GROUP) ?? groups[0]
  const entry = group?.entries[0]
  if (group === undefined || entry === undefined) {
    throw new Error('Settings has no entries')
  }
  return { group, entry, picked: named !== undefined }
}

// Every entry whose title or keywords contain all the words of the query; none for a blank query.
export function searchEntries(
  groups: readonly SettingsGroup[],
  query: string,
): readonly SettingsEntry[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== '')
  if (terms.length === 0) {
    return []
  }
  return groups
    .flatMap((group) => group.entries)
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.keywords}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
}
