import type { WorkspaceTab } from '@workday/core'
import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { openInVsCode } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { ChangesView } from './ChangesView.js'
import { FilesView } from './FilesView.js'
import { SEGMENT_GROUP, segmentClass } from '../ui/segmentedStyle.js'
import type { PaneToggle } from './paneToggle.js'
import { TeamsView } from './teams/TeamsView.js'
import { useTeamsPending } from './teams/useTeams.js'

type LeftTab = 'changes' | 'files' | 'teams'

interface LeftPaneProps {
  readonly tab: WorkspaceTab
  readonly teamsConversation: string | null // from the hash; opens the Teams view on it
  readonly toggle: PaneToggle // hides this pane, or brings Claude back
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
      className={segmentClass(selected)}
      onClick={onSelect}
    >
      Teams
      {pending ? (
        <span
          className="size-2 flex-none rounded-full bg-danger"
          role="img"
          aria-label={t('New messages', 'Có tin mới')}
        />
      ) : null}
    </button>
  )
}

export function LeftPane({
  tab: workspaceTab,
  teamsConversation,
  toggle,
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="workspace-left">
      <div className="flex flex-wrap items-center gap-1.5 pb-2">
        <div role="tablist" className={SEGMENT_GROUP}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'changes'}
            className={segmentClass(tab === 'changes')}
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
            className={segmentClass(tab === 'files')}
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
        {isTicket ? null : (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              void openInVsCode(tabId)
            }}
          >
            VS Code
          </Button>
        )}
        <Button className="ml-auto" variant="secondary" size="sm" onPress={toggle.onPress}>
          {toggle.label}
        </Button>
      </div>
      <div
        className={`min-h-0 flex-1 ${tab === 'teams' ? 'overflow-auto pr-2 [scrollbar-gutter:stable]' : 'overflow-hidden'}`}
      >
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
