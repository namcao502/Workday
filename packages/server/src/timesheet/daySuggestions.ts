import {
  parseTicketKeys,
  selectDaySuggestions,
  type BoardState,
  type DaySuggestion,
  type DayTicketActivity,
  type TimesheetView,
} from '@workday/core'
import type { DayActivityOptions } from './dayActivity.js'

export type DaySuggestionsSource = (date: string) => Promise<readonly DaySuggestion[]>

export interface DaySuggestionsDeps {
  readonly board: () => BoardState
  readonly timesheet: () => TimesheetView
  readonly config: () => {
    readonly timeZone: string
    readonly jira: { readonly projectKey: string } | null
    readonly workspace: {
      readonly devRepoPath: string | null
      readonly siblingRepoGlob: string | null
    }
  }
  readonly readActivity: (
    options: Omit<DayActivityOptions, 'projectsRoot'>,
  ) => Promise<Readonly<Record<string, DayTicketActivity>>>
}

// Tickets the day already holds: queued, written in TSC, or logged in HRM.
function loggedKeys(view: TimesheetView, date: string, projectKey: string): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const entry of view.queue.filter((item) => item.date === date)) {
    entry.tickets.forEach((key) => keys.add(key))
  }
  const day = view.week?.coverage?.find((item) => item.date === date)
  parseTicketKeys(day?.tscText ?? null, projectKey).tickets.forEach((key) => keys.add(key))
  for (const task of view.week?.hrmTasks ?? []) {
    if (task.date === date) {
      keys.add(task.ticketKey)
    }
  }
  return keys
}

// Started tickets (board "in progress") with commits or Claude work on the date, that the day does not hold yet.
export function createDaySuggestions(deps: DaySuggestionsDeps): DaySuggestionsSource {
  return async (date) => {
    const config = deps.config()
    const { devRepoPath, siblingRepoGlob } = config.workspace
    if (devRepoPath === null || config.jira === null) {
      return []
    }
    const { projectKey } = config.jira
    const started = Object.values(deps.board().inProgress).map((ticket) => ({
      key: ticket.key,
      summary: ticket.summary,
    }))
    const activity = await deps.readActivity({
      devRepoPath,
      siblingRepoGlob,
      projectKey,
      timeZone: config.timeZone,
      date,
      keys: started.map((ticket) => ticket.key),
    })
    return selectDaySuggestions(started, activity, loggedKeys(deps.timesheet(), date, projectKey))
  }
}
