import type { SettingsView } from '@workday/core'
import { t } from '../i18n.js'
import { SchedulesSection } from '../schedules/SchedulesSection.js'
import { AzureDevOpsSection } from './AzureDevOpsSection.js'
import { ConnectionsSection } from './ConnectionsSection.js'
import { GeneralSection } from './GeneralSection.js'
import { GuideSection } from './GuideSection.js'
import { NoticesSection } from './NoticesSection.js'
import { RemoteSection } from './RemoteSection.js'
import { TeamsSection } from './TeamsSection.js'
import { TimesheetSection } from './TimesheetSection.js'
import { WorkspaceSection } from './WorkspaceSection.js'

export type SettingsGroupId = 'general' | 'integrations' | 'work' | 'remote' | 'guide'

export interface SettingsEntry {
  readonly id: string
  readonly title: string
  readonly keywords: string // lowercase words the search also matches, beyond the title
  readonly render: (settings: SettingsView) => React.JSX.Element
}

export interface SettingsGroup {
  readonly id: SettingsGroupId
  readonly label: string
  readonly entries: readonly SettingsEntry[]
}

export const DEFAULT_GROUP: SettingsGroupId = 'general'

// Built on each render so the labels follow the UI language.
export function settingsGroups(): readonly SettingsGroup[] {
  return [
    {
      id: 'general',
      label: t('General', 'Chung'),
      entries: [
        {
          id: 'general',
          title: t('General', 'Chung'),
          keywords: 'theme dark light language english vietnamese time zone port',
          render: (settings) => <GeneralSection settings={settings} />,
        },
        {
          id: 'notices',
          title: t('Notices', 'Thông báo'),
          keywords: 'notification toast sound topic bell alert',
          render: (settings) => <NoticesSection settings={settings} />,
        },
      ],
    },
    {
      id: 'integrations',
      label: t('Integrations', 'Tích hợp'),
      entries: [
        {
          id: 'connections',
          title: t('Connections', 'Kết nối'),
          keywords: 'jira url email api token project key eta dev priority jql poll',
          render: (settings) => <ConnectionsSection settings={settings} />,
        },
        {
          id: 'ado',
          title: 'Azure DevOps',
          keywords: 'ado pull request pr pat organization repo',
          render: (settings) => <AzureDevOpsSection settings={settings} />,
        },
        {
          id: 'teams',
          title: 'Teams',
          keywords: 'microsoft chat channel browser profile sign in',
          render: (settings) => <TeamsSection settings={settings} />,
        },
      ],
    },
    {
      id: 'work',
      label: t('Work', 'Công việc'),
      entries: [
        {
          id: 'timesheet',
          title: t('Timesheet', 'Chấm công'),
          keywords: 'hrm tsc log time hours reminder sign in work log',
          render: (settings) => <TimesheetSection settings={settings} />,
        },
        {
          id: 'workspace',
          title: t('Workspace', 'Không gian làm việc'),
          keywords: 'dev repo folder worktree clean up slim claude terminal model',
          render: (settings) => <WorkspaceSection settings={settings} />,
        },
        {
          id: 'schedules',
          title: t('Schedules', 'Lịch chạy'),
          keywords: 'knowledge scan jobs cron run now in-app',
          render: () => <SchedulesSection />,
        },
      ],
    },
    {
      id: 'remote',
      label: t('Remote access', 'Truy cập từ xa'),
      entries: [
        {
          id: 'remote',
          title: t('Remote access', 'Truy cập từ xa'),
          keywords: 'tunnel cloudflare access device pair phone mobile jwt',
          render: (settings) => <RemoteSection settings={settings} />,
        },
      ],
    },
    {
      id: 'guide',
      label: t('Guide', 'Hướng dẫn'),
      entries: [
        {
          id: 'guide',
          title: t('Guide', 'Hướng dẫn'),
          keywords: 'help how to token setup',
          render: () => <GuideSection />,
        },
      ],
    },
  ]
}

// "#/settings/work" -> "work"; anything else is the first group.
export function settingsGroupFromHash(hash: string): SettingsGroupId {
  const name = hash.replace(/^#\/?/, '').split('?')[0]?.split('/')[1]
  return settingsGroups().find((group) => group.id === name)?.id ?? DEFAULT_GROUP
}

export function navigateToSettings(group: SettingsGroupId): void {
  window.location.hash = `#/settings/${group}`
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
