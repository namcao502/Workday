import type { WorkspaceTab } from '@workday/core'
import { Badge, Button } from '@heroui/react'
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

const TAB_CLASS = 'flex h-7 items-center gap-1.5 rounded-lg px-3 text-sm'

function tabClass(selected: boolean): string {
  return selected ? `${TAB_CLASS} bg-surface shadow-sm` : `${TAB_CLASS} text-muted`
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
      className={tabClass(selected)}
      onClick={onSelect}
    >
      Teams
      {pending ? (
        <Badge color="danger" size="sm" role="img" aria-label={t('New messages', 'Có tin mới')} />
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
    <div className="flex min-h-0 min-w-0 flex-[1_1_50%] flex-col" data-testid="workspace-left">
      <div className="flex items-center gap-1.5 pb-2">
        <div role="tablist" className="flex gap-0.5 rounded-xl bg-surface-secondary p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'changes'}
            className={tabClass(tab === 'changes')}
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
            className={tabClass(tab === 'files')}
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
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            void openInVsCode(tabId)
          }}
        >
          VS Code
        </Button>
        <Button variant="ghost" size="sm" onPress={onHide}>
          {t('Hide', 'Ẩn')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
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
