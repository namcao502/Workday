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

const REMEMBERED_KEY = 'workday.workspace.selection'

export function rememberSelection(selection: WorkspaceSelection): void {
  try {
    localStorage.setItem(REMEMBERED_KEY, JSON.stringify(selection))
  } catch {
    // Storage full or blocked: the page then opens on the first tab, as before.
  }
}

// The tab and session the user left last; a hash that names none opens there.
export function rememberedSelection(): WorkspaceSelection {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REMEMBERED_KEY) ?? 'null')
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      const tab = record['tab']
      const session = record['session']
      return {
        tab: typeof tab === 'string' ? tab : null,
        session: typeof session === 'string' ? session : null,
      }
    }
  } catch {
    // A hand-edited value falls through to "nothing remembered".
  }
  return { tab: null, session: null }
}

// The hash wins; without a tab in it the remembered pair applies (the session only with its own tab).
export function withRemembered(
  fromHash: WorkspaceSelection,
  remembered: WorkspaceSelection,
): WorkspaceSelection {
  return fromHash.tab === null ? remembered : fromHash
}
