import type { SessionView, WorkspaceTab } from '@workday/core'
import { Alert, Button } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
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
import { currentHash } from '../shell/appHash.js'
import { useNarrow } from '../shell/useNarrow.js'
import { Page, PageHeading } from '../ui/Page.js'
import { SplitView } from '../ui/SplitView.js'
import { useStoredSplit } from '../ui/useStoredSplit.js'
import { TicketInfoBar } from './TicketInfoBar.js'
import { ClaudePane, sessionLabel } from './ClaudePane.js'
import { isOpenFileRequest, OPEN_FILE_EVENT, type OpenFileRequest } from './fileLinks.js'
import { LeftPane } from './LeftPane.js'
import {
  rememberedSelection,
  rememberSelection,
  resolveSelection,
  withRemembered,
} from './selection.js'
import { requestNoticePermission } from './useClaudeNotices.js'
import { tabLabel, WorkspaceTabs } from './WorkspaceTabs.js'
import './workspace.css'
import { SkeletonRows } from '../ui/Skeleton.js'

const DEFAULT_SHARE = 0.5
const MIN_PANE_PX = 240

function useHashSelection(): WorkspaceSelection {
  const [selection, setSelection] = useState(() => workspaceSelectionFromHash(currentHash()))
  // Read once: the sidebar link carries no tab, so the page opens where the user left it.
  const [remembered] = useState(rememberedSelection)
  useEffect(() => {
    function handleHashChange(): void {
      setSelection(workspaceSelectionFromHash(currentHash()))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])
  return withRemembered(selection, remembered)
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
  const [closingSession, setClosingSession] = useState<{
    readonly tabId: string
    readonly name: string
  } | null>(null)
  const view = workspace.data
  const { tab, session } = resolveSelection(view?.tabs ?? [], selection)
  const tabId = tab?.id ?? null
  useEffect(() => {
    if (tabId !== null) {
      rememberSelection({ tab: tabId, session })
    }
  }, [tabId, session])
  useMarkSeen(
    view?.sessions.find((candidate) => candidate.name === session),
    actions.markSeen,
  )

  // Each tab keeps its own share and hidden pane, as in the WPF app.
  const split = useStoredSplit(tab?.id ?? '')
  // A phone shows one pane at a time: Claude first, the files on request (not stored, the wide layout keeps its own).
  const narrow = useNarrow()
  const [phonePane, setPhonePane] = useState<'claude' | 'files'>('claude')
  const hidden = narrow ? (phonePane === 'claude' ? 'left' : 'right') : split.hidden
  const showBoth = useRef(() => {})
  useEffect(() => {
    showBoth.current = () => {
      if (narrow) {
        setPhonePane('files')
      } else {
        split.setHidden('none')
      }
    }
  })

  // A file link in the chat opens the file in this tab's Files view, showing the pane if it was hidden.
  const [fileRequest, setFileRequest] = useState<OpenFileRequest | null>(null)
  useEffect(() => {
    function open(event: Event): void {
      if (
        event instanceof CustomEvent &&
        isOpenFileRequest(event.detail) &&
        event.detail.tabId === tabId
      ) {
        showBoth.current()
        setFileRequest(event.detail)
      }
    }
    window.addEventListener(OPEN_FILE_EVENT, open)
    return () => {
      window.removeEventListener(OPEN_FILE_EVENT, open)
    }
  }, [tabId])

  // A Teams notice must be visible even if the left pane was hidden.
  const teamsConversation = teamsConversationFromHash(currentHash())
  useEffect(() => {
    if (teamsConversation !== null) {
      showBoth.current()
    }
  }, [teamsConversation, selection])

  useEffect(() => {
    requestNoticePermission()
  }, [])

  if (view === undefined) {
    return (
      <Page title={t('workspace.workspace')}>
        <SkeletonRows label={t('workspace.loading')} rows={3} />
      </Page>
    )
  }
  if (!view.configured) {
    return (
      <Page title={t('workspace.workspace')}>
        <p className="text-sm text-muted">{t('workspace.setTheDevRepoInSettings')}</p>
        <div>
          <Button
            variant="primary"
            onPress={() => {
              navigateTo('settings')
            }}
          >
            {t('workspace.openSettings')}
          </Button>
        </div>
      </Page>
    )
  }

  function showBothNow(): void {
    if (narrow) {
      setPhonePane(hidden === 'left' ? 'files' : 'claude')
    } else {
      split.setHidden('none')
    }
  }

  function closeTab(target: WorkspaceTab): void {
    setClosing(target)
  }

  // As in the WPF app a session that is still running asks first; an idle one closes at once.
  function closeSessionOf(paneTab: WorkspaceTab, name: string): void {
    if (view?.sessions.some((candidate) => candidate.name === name && candidate.running) === true) {
      setClosingSession({ tabId: paneTab.id, name })
      return
    }
    void actions.closeSession(name)
    navigateToWorkspace(paneTab.id)
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
    <section className="flex h-full min-h-0 flex-col gap-3 px-3 pb-4 md:px-6">
      <PageHeading
        title={t('workspace.workspace')}
        actions={
          <div className="min-w-0 flex-1">
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
              onMove={(id, index) => {
                void actions.moveTab(id, index)
              }}
            />
          </div>
        }
      />
      {warning === null ? null : (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{warning}</Alert.Title>
          </Alert.Content>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setWarning(null)
            }}
          >
            {t('workspace.dismiss')}
          </Button>
        </Alert>
      )}
      {tab?.kind === 'ticket' ? <TicketInfoBar ticketKey={tab.id} /> : null}
      {tab === null || session === null ? (
        <p className="text-sm text-muted">{t('workspace.noOpenTabs')}</p>
      ) : (
        <SplitView
          className="flex-1"
          share={split.share ?? DEFAULT_SHARE}
          onShareChange={split.setShare}
          hidden={hidden}
          minPx={MIN_PANE_PX}
          left={
            hidden === 'left' ? null : (
              // Distinct keys per sibling: a key shared with ClaudePane left old panes mounted on tab switch.
              <LeftPane
                key={`left-${tab.id}`}
                tab={tab}
                teamsConversation={teamsConversation}
                fileRequest={fileRequest?.tabId === tab.id ? fileRequest : null}
                toggle={
                  hidden === 'right'
                    ? {
                        label: narrow ? 'Claude' : t('workspace.showClaude'),
                        onPress: showBothNow,
                      }
                    : {
                        label: t('workspace.hide'),
                        onPress: () => {
                          split.setHidden('left')
                        },
                      }
                }
              />
            )
          }
          right={view.tabs.map((paneTab) => {
            const active = paneTab.id === tab.id
            // A hidden pane shows nothing, so any of its sessions will do; every one stays mounted.
            const shown = active ? session : (paneTab.sessions[0] ?? '')
            return (
              <ClaudePane
                key={`claude-${paneTab.id}`}
                tab={paneTab}
                active={active}
                selected={shown}
                toggle={
                  hidden === 'left'
                    ? {
                        label: narrow ? t('workspace.files') : t('workspace.showFiles'),
                        onPress: showBothNow,
                      }
                    : {
                        label: t('workspace.hideClaude'),
                        onPress: () => {
                          split.setHidden('right')
                        },
                      }
                }
                onSelect={(name) => {
                  navigateToWorkspace(paneTab.id, name)
                }}
                onAdd={() => {
                  void actions.addSession(paneTab.id)
                }}
                onClose={(name) => {
                  closeSessionOf(paneTab, name)
                }}
              />
            )
          })}
        />
      )}
      {closing === null ? null : (
        <ConfirmDialog
          message={
            view.sessions.some(
              (candidate) => candidate.running && closing.sessions.includes(candidate.name),
            )
              ? t('workspace.hasARunningSessionCloseThe', { closing: tabLabel(closing) })
              : t('workspace.close3', { closing: tabLabel(closing) })
          }
          confirmLabel={t('workspace.close4', { closing: tabLabel(closing) })}
          onConfirm={confirmClose}
          onCancel={() => {
            setClosing(null)
          }}
        />
      )}
      {closingSession === null ? null : (
        <ConfirmDialog
          message={t('workspace.isStillRunningCloseItAnd', {
            name: sessionLabel(closingSession.name),
          })}
          confirmLabel={t('workspace.close2', { name: sessionLabel(closingSession.name) })}
          onConfirm={() => {
            void actions.closeSession(closingSession.name)
            navigateToWorkspace(closingSession.tabId)
            setClosingSession(null)
          }}
          onCancel={() => {
            setClosingSession(null)
          }}
        />
      )}
    </section>
  )
}
