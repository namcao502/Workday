import type { WorkspaceTab } from '@workday/core'
import type { WorkspaceSelection } from '../shell/pages.js'

export interface ResolvedSelection {
  readonly tab: WorkspaceTab | null
  readonly session: string | null
}

// A hash naming a missing tab or session falls back to the first tab / its first session.
export function resolveSelection(
  tabs: readonly WorkspaceTab[],
  selection: WorkspaceSelection,
): ResolvedSelection {
  const tab = tabs.find((candidate) => candidate.id === selection.tab) ?? tabs[0] ?? null
  if (tab === null) {
    return { tab: null, session: null }
  }
  const session =
    selection.session !== null && tab.sessions.includes(selection.session)
      ? selection.session
      : (tab.sessions[0] ?? null)
  return { tab, session }
}
