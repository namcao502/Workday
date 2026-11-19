import { t } from '../i18n.js'

// Names each request for the bell's "running now" list (WPF BusyWork labels).
// Built at read time, so it follows the app language.

type Label = (id: string) => string // id: the ticket key in the path or query key, else empty

interface Rule {
  readonly pattern: RegExp // matched against the path without its query string
  readonly label: Label
}

const KEY = '([^/]+)'

// First match wins, so a specific path comes before its area's catch-all.
const ACTION_RULES: readonly Rule[] = [
  {
    pattern: /^\/api\/board\/check$/,
    label: () => t('api.checkingJiraForTicketChanges'),
  },
  { pattern: /^\/api\/board\/add$/, label: () => t('api.addingATicket') },
  {
    pattern: new RegExp(`^/api/board/${KEY}/`),
    label: (id) => t('api.updating', { id }),
  },
  {
    pattern: /^\/api\/settings\/jira\/check$/,
    label: () => t('api.checkingTheJiraConnection'),
  },
  {
    pattern: /^\/api\/settings\/ado\/check$/,
    label: () => t('api.checkingTheAzureDevopsConnection'),
  },
  {
    pattern: /^\/api\/settings\/hrm\/check$/,
    label: () => t('api.checkingTheHrmConnection'),
  },
  { pattern: /^\/api\/settings\/tsc\//, label: () => t('api.signingInToTsc') },
  { pattern: /^\/api\/settings$/, label: () => t('api.savingSettings') },
  {
    pattern: /^\/api\/timesheet\/drain$/,
    label: () => t('api.loggingTheQueuedDays'),
  },
  {
    pattern: /^\/api\/timesheet\/log$/,
    label: () => t('api.loggingHoursToTscAndHrm'),
  },
  { pattern: /^\/api\/timesheet\/off$/, label: () => t('api.loggingADayOff') },
  {
    pattern: /^\/api\/timesheet\/week$/,
    label: () => t('api.readingTheWeekSLogs'),
  },
  {
    pattern: /^\/api\/timesheet\/tickets\/check$/,
    label: () => t('api.checkingTheTypedTickets'),
  },
  {
    pattern: /^\/api\/timesheet\/queue/,
    label: () => t('api.updatingTheLogQueue'),
  },
  {
    pattern: /^\/api\/teams\/signin$/,
    label: () => t('api.signingInToTeams'),
  },
  {
    pattern: new RegExp(`^/api/teams/${KEY}/(reply|post)$`),
    label: (id) => t('api.sendingTheReplyToTeams', { id }),
  },
  {
    pattern: new RegExp(`^/api/teams/${KEY}/analysis$`),
    label: (id) => t('api.startingTheAnalysis', { id }),
  },
  {
    pattern: new RegExp(`^/api/teams/${KEY}/handoff$`),
    label: (id) => t('api.handingToClaude', { id }),
  },
  { pattern: /^\/api\/teams\//, label: () => t('api.updatingTeams') },
  {
    pattern: new RegExp(`^/api/workspace/start/${KEY}$`),
    label: (id) => t('api.creatingTheWorktree', { id }),
  },
  {
    pattern: new RegExp(`^/api/workspace/open/${KEY}$`),
    label: (id) => t('api.opening', { id }),
  },
  { pattern: /^\/api\/workspace\/vscode$/, label: () => t('api.openingVsCode') },
  {
    pattern: /^\/api\/workspace\/cleanup/,
    label: () => t('api.cleaningUpWorktrees'),
  },
  {
    pattern: /^\/api\/workspace\/sessions\/[^/]+\/rewind$/,
    label: () => t('api.rewindingFiles'),
  },
  {
    pattern: /^\/api\/workspace\/sessions\/[^/]+\/prompt$/,
    label: () => t('api.sendingToClaude'),
  },
  {
    pattern: /^\/api\/workspace\//,
    label: () => t('api.updatingTheWorkspace'),
  },
  {
    pattern: new RegExp(`^/api/work/ready-to-test/${KEY}$`),
    label: (id) => t('api.movingToReadyToTest', { id }),
  },
  {
    pattern: new RegExp(`^/api/work/suggestions/${KEY}/take$`),
    label: (id) => t('api.taking', { id }),
  },
  {
    pattern: new RegExp(`^/api/work/bugs/${KEY}/fix$`),
    label: (id) => t('api.startingTheFix', { id }),
  },
  {
    pattern: new RegExp(`^/api/tickets/${KEY}/update`),
    label: (id) => t('api.updating', { id }),
  },
  {
    pattern: /^\/api\/schedules\/scan\/run$/,
    label: () => t('api.runningTheKnowledgeScan'),
  },
  { pattern: /^\/api\/insights$/, label: () => t('api.readingTheReport') },
  {
    pattern: /^\/api\/(remote|pair)/,
    label: () => t('api.updatingRemoteAccess'),
  },
  {
    pattern: /^\/api\/push/,
    label: () => t('api.updatingPhoneNotifications'),
  },
  { pattern: /^\/api\/notices/, label: () => t('api.updatingNotices') },
]

const LOAD_LABELS: Readonly<Record<string, Label>> = {
  board: () => t('api.loadingTheTickets'),
  work: () => t('api.loadingTheToDoList'),
  timesheet: () => t('api.loadingTheTimesheet'),
  'day-suggestions': () => t('api.loadingTheDaySuggestions'),
  insights: () => t('api.readingTheReport'),
  teams: (id) => t('api.readingTeamsFor', { id }),
  'teams-analysis': (id) => t('api.readingTheAnalysis', { id }),
  'ticket-update': (id) => t('api.readingWhatChangedIn', { id }),
  workspace: () => t('api.loadingTheWorkspace'),
  'workspace-files': () => t('api.loadingFiles'),
  folders: () => t('api.loadingFolders'),
  settings: () => t('api.loadingSettings'),
  schedules: () => t('api.loadingSchedules'),
  notices: () => t('api.loadingNotices'),
  remote: () => t('api.loadingRemoteAccess'),
}

export function actionLabel(path: string): string {
  const bare = path.split('?')[0] ?? path
  for (const rule of ACTION_RULES) {
    const match = rule.pattern.exec(bare)
    if (match !== null) {
      return rule.label(decodeURIComponent(match[1] ?? ''))
    }
  }
  return t('api.working')
}

// A query key is [area, ...ids]; the second part is the ticket where the area has one.
export function loadLabel(queryKey: readonly unknown[]): string {
  const [area, id] = queryKey
  const label = typeof area === 'string' ? LOAD_LABELS[area] : undefined
  if (label === undefined) {
    return t('api.loading')
  }
  return label(typeof id === 'string' ? id : '')
}
