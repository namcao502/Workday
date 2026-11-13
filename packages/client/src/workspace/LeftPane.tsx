import type { WorkspaceTab } from '@workday/core'
import { useEffect, useState } from 'react'
import { openInVsCode } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { ChangesView } from './ChangesView.js'
import { FilesView } from './FilesView.js'
import { TeamsView } from './teams/TeamsView.js'
import { useTeamsPending } from './teams/useTeams.js'

type LeftTab = 'changes' | 'files' | 'teams'

interface LeftPaneProps {
  readonly tab: WorkspaceTab
  readonly teamsConversation: string | null // from the hash; opens the Teams view on it
  readonly onHide: () => void
}

function TeamsTabButton({
  ticket,
  viewPending,
  selected,
  onSelect,
}: {
  readonly ticket: string
  readonly viewPending: boolean // the open Teams view's own pending list
  readonly selected: boolean
  readonly onSelect: () => void
}): React.JSX.Element {
  const pending = useTeamsPending(ticket) || viewPending
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-selected={selected}
      onClick={onSelect}
    >
      Teams
      {pending ? (
        <span className="teams-dot" role="img" aria-label={t('New messages', 'Có tin mới')} />
      ) : null}
    </button>
  )
}

export function LeftPane({
  tab: workspaceTab,
  teamsConversation,
  onHide,
}: LeftPaneProps): React.JSX.Element {
  const tabId = workspaceTab.id
  const isTicket = workspaceTab.kind === 'ticket'
  const [tab, setTab] = useState<LeftTab>(
    teamsConversation !== null && isTicket ? 'teams' : 'files',
  )
  const [viewPending, setViewPending] = useState(false)
  useEffect(() => {
    if (teamsConversation !== null && isTicket) {
      setTab('teams')
    }
  }, [teamsConversation, isTicket])
  return (
    <div className="workspace-left" data-testid="workspace-left">
      <div className="pane-toolbar">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'changes'}
            data-selected={tab === 'changes'}
            onClick={() => {
              setTab('changes')
            }}
          >
            {t('Changes', 'Thay đổi')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'files'}
            data-selected={tab === 'files'}
            onClick={() => {
              setTab('files')
            }}
          >
            {t('Files', 'Tệp')}
          </button>
          {isTicket ? (
            <TeamsTabButton
              ticket={tabId}
              viewPending={tab === 'teams' && viewPending}
              selected={tab === 'teams'}
              onSelect={() => {
                setTab('teams')
              }}
            />
          ) : null}
        </div>
        <button
          type="button"
          className="button ghost"
          onClick={() => {
            void openInVsCode(tabId)
          }}
        >
          VS Code
        </button>
        <button type="button" className="button ghost" onClick={onHide}>
          {t('Hide', 'Ẩn')}
        </button>
      </div>
      <div className="pane-scroll">
        {tab === 'changes' ? <ChangesView tabId={tabId} /> : null}
        {tab === 'files' ? <FilesView tabId={tabId} /> : null}
        {tab === 'teams' ? (
          <TeamsView
            ticket={tabId}
            conversation={teamsConversation ?? ''}
            firstSession={workspaceTab.sessions[0] ?? tabId}
            visible
            onPendingChange={setViewPending}
          />
        ) : null}
      </div>
    </div>
  )
}
