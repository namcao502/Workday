import type { SessionView, WorkspaceTab } from '@workday/core'
import { Alert, Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useStartWarning, useWorkspace, useWorkspaceActions } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import {
  navigateTo,
  navigateToWorkspace,
  teamsConversationFromHash,
  workspaceSelectionFromHash,
  type WorkspaceSelection,
} from '../shell/pages.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Page } from '../ui/Page.js'
import { ClaudePane } from './ClaudePane.js'
import { LeftPane } from './LeftPane.js'
import { resolveSelection } from './selection.js'
import { requestNoticePermission } from './useClaudeNotices.js'
import { tabLabel, WorkspaceTabs } from './WorkspaceTabs.js'
import './workspace.css'

function useHashSelection(): WorkspaceSelection {
  const [selection, setSelection] = useState(() => workspaceSelectionFromHash(window.location.hash))
  useEffect(() => {
    function handleHashChange(): void {
      setSelection(workspaceSelectionFromHash(window.location.hash))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])
  return selection
}

// Opening a finished session while the window has focus counts as reading it.
function useMarkSeen(
  current: SessionView | undefined,
  markSeen: (name: string) => Promise<void>,
): void {
  const name = current?.name
  const finished = current?.wait === 'finished'
  useEffect(() => {
    if (name === undefined || !finished) {
      return undefined
    }
    function mark(): void {
      if (name !== undefined && document.hasFocus()) {
        void markSeen(name)
      }
    }
    mark()
    window.addEventListener('focus', mark)
    return () => {
      window.removeEventListener('focus', mark)
    }
  }, [name, finished, markSeen])
}

export function WorkspacePage(): React.JSX.Element {
  const workspace = useWorkspace()
  const actions = useWorkspaceActions()
  const selection = useHashSelection()
  const { warning, setWarning } = useStartWarning()
  const [closing, setClosing] = useState<WorkspaceTab | null>(null)
  const [leftHidden, setLeftHidden] = useState(false)
  const view = workspace.data
  const { tab, session } = resolveSelection(view?.tabs ?? [], selection)
  useMarkSeen(
    view?.sessions.find((candidate) => candidate.name === session),
    actions.markSeen,
  )

  // A Teams notice must be visible even if the left pane was hidden.
  const teamsConversation = teamsConversationFromHash(window.location.hash)
  useEffect(() => {
    if (teamsConversation !== null) {
      setLeftHidden(false)
    }
  }, [teamsConversation, selection])

  useEffect(() => {
    requestNoticePermission()
  }, [])

  if (view === undefined) {
    return (
      <Page title={t('Workspace', 'Không gian làm việc')}>
        <p className="text-sm text-muted">{t('Loading...', 'Đang tải...')}</p>
      </Page>
    )
  }
  if (!view.configured) {
    return (
      <Page title={t('Workspace', 'Không gian làm việc')}>
        <p className="text-sm text-muted">
          {t('Set the dev repo in Settings', 'Hãy đặt dev repo trong Cài đặt')}
        </p>
        <div>
          <Button
            variant="primary"
            onPress={() => {
              navigateTo('settings')
            }}
          >
            {t('Open Settings', 'Mở Cài đặt')}
          </Button>
        </div>
      </Page>
    )
  }

  function closeTab(target: WorkspaceTab): void {
    const running = view?.sessions.some(
      (candidate) => candidate.running && target.sessions.includes(candidate.name),
    )
    if (running === true) {
      setClosing(target)
      return
    }
    void actions.closeTab(target.id)
  }

  function confirmClose(): void {
    if (closing !== null) {
      void actions.closeTab(closing.id)
      if (closing.id === tab?.id) {
        navigateToWorkspace(null)
      }
    }
    setClosing(null)
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 px-6 pb-4">
      {warning === null ? null : (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{warning}</Alert.Title>
          </Alert.Content>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setWarning(null)
            }}
          >
            {t('Dismiss', 'Bỏ qua')}
          </Button>
        </Alert>
      )}
      <WorkspaceTabs
        tabs={view.tabs}
        sessions={view.sessions}
        selectedId={tab?.id ?? null}
        recentFolders={view.recentFolders}
        onSelect={(id) => {
          navigateToWorkspace(id)
        }}
        onClose={closeTab}
        onAddTerminal={(folder) => {
          void actions.addTerminal(folder)
        }}
      />
      {tab === null || session === null ? (
        <p className="text-sm text-muted">{t('No open tabs', 'Chưa có thẻ nào')}</p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          {leftHidden ? (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setLeftHidden(false)
                }}
              >
                {t('Show files', 'Hiện tệp')}
              </Button>
            </div>
          ) : (
            // Distinct keys per sibling: a key shared with ClaudePane left old panes mounted on tab switch.
            <LeftPane
              key={`left-${tab.id}`}
              tab={tab}
              teamsConversation={teamsConversation}
              onHide={() => {
                setLeftHidden(true)
              }}
            />
          )}
          {view.tabs.map((paneTab) => {
            const active = paneTab.id === tab.id
            // A hidden pane shows nothing, so any of its sessions will do; every one stays mounted.
            const shown = active ? session : (paneTab.sessions[0] ?? '')
            return (
              <ClaudePane
                key={`claude-${paneTab.id}`}
                tab={paneTab}
                active={active}
                selected={shown}
                onSelect={(name) => {
                  navigateToWorkspace(paneTab.id, name)
                }}
                onAdd={() => {
                  void actions.addSession(paneTab.id)
                }}
                onClose={(name) => {
                  void actions.closeSession(name)
                  navigateToWorkspace(paneTab.id)
                }}
              />
            )
          })}
        </div>
      )}
      {closing === null ? null : (
        <ConfirmDialog
          message={t(
            `${tabLabel(closing)} has a running session. Close it?`,
            `${tabLabel(closing)} có phiên đang chạy. Đóng nó?`,
          )}
          confirmLabel={t(`Close ${tabLabel(closing)}`, `Đóng ${tabLabel(closing)}`)}
          onConfirm={confirmClose}
          onCancel={() => {
            setClosing(null)
          }}
        />
      )}
    </section>
  )
}
