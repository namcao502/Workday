import {
  attentionKeys,
  buildTodos,
  groupTodos,
  isDevPrMerged,
  latestPrs,
  readyToTestSteps,
  type AzureDevOpsConfig,
  type BoardState,
  type JiraConfig,
  type SessionView,
  type TeamsAttentionItem,
  type StatusFlow,
  type Suggestion,
  type TicketPr,
  type TodoWait,
  type WorkspaceTab,
  type WorkView,
} from '@workday/core'
import type { PrState } from '../prs/prService.js'

export interface WorkViewInput {
  readonly board: BoardState
  readonly today: string
  readonly jira: JiraConfig | null
  readonly ado: AzureDevOpsConfig | null
  readonly adoConnected: boolean
  readonly prs: PrState
  readonly lastPrCheck: { readonly at: string; readonly ok: boolean } | null
  readonly sessions: readonly SessionView[]
  readonly tabs: readonly WorkspaceTab[]
  readonly suggestions: {
    readonly epicKey: string | null
    readonly items: readonly Suggestion[]
  } | null
  readonly teams: readonly TeamsAttentionItem[]
}

const NO_FLOW: StatusFlow = {
  preWorkStatuses: [],
  reworkStatuses: [],
  readyToTestPath: [],
  developerStatuses: [],
}

// A session that waits on the user, with the tab it lives in; a ticket tab's id is the ticket key.
function waitsOf(
  sessions: readonly SessionView[],
  tabs: readonly WorkspaceTab[],
): readonly TodoWait[] {
  const waits: TodoWait[] = []
  for (const session of sessions) {
    const tab = tabs.find((candidate) => candidate.sessions.includes(session.name))
    if (session.wait !== null && tab !== undefined) {
      waits.push({
        session: session.name,
        tab: tab.id,
        ticketKey: tab.kind === 'ticket' ? tab.id : null,
        wait: session.wait,
      })
    }
  }
  return waits
}

export function buildWorkView(input: WorkViewInput): WorkView {
  const flow = input.jira === null ? NO_FLOW : input.jira.statusFlow
  const repoLabels = input.ado === null ? {} : input.ado.repoLabels
  const { board, prs } = input
  const groups = groupTodos(
    buildTodos({
      board,
      today: input.today,
      flow,
      tracking: prs.tracking,
      repoLabels,
      commentAlerts: prs.commentAlerts,
      reviews: prs.reviews,
      deploys: prs.deploys,
      waits: waitsOf(input.sessions, input.tabs),
      teams: input.teams,
    }),
  )
  const ticketPrs: Record<string, readonly TicketPr[]> = {}
  const readyToTest: Record<string, readonly string[]> = {}
  for (const section of ['new', 'inProgress', 'done'] as const) {
    for (const ticket of Object.values(board[section])) {
      const found = latestPrs(ticket.key, prs.tracking, repoLabels)
      if (found.length !== 0) {
        ticketPrs[ticket.key] = found
      }
      const steps = readyToTestSteps(
        section,
        ticket.status,
        isDevPrMerged(prs.tracking, ticket.key),
        flow.readyToTestPath,
      )
      if (steps !== null) {
        readyToTest[ticket.key] = steps
      }
    }
  }
  const configured = input.jira !== null && input.jira.suggestions !== null
  return {
    adoConnected: input.adoConnected,
    lastPrCheck: input.lastPrCheck,
    groups,
    attention: attentionKeys(groups).length,
    prs: ticketPrs,
    readyToTest,
    suggestions: configured ? input.suggestions : null,
  }
}
