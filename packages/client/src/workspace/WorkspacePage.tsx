import type { SessionView, WorkspaceTab } from '@workday/core'
import { useEffect, useState } from 'react'
import { useStartWarning, useWorkspace, useWorkspaceActions } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import {
  navigateTo,
  navigateToWorkspace,
  workspaceSelectionFromHash,
  type WorkspaceSelection,
} from '../shell/pages.js'
import { ConfirmDialog } from '../timesheet/ConfirmDialog.js'
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

  useEffect(() => {
    requestNoticePermission()
  }, [])

  if (view === undefined) {
    return (
      <section className="page workspace-page">
        <h1 className="page-title">{t('Workspace', 'Không gian làm việc')}</h1>
        <p className="muted">{t('Loading...', 'Đang tải...')}</p>
      </section>
    )
  }
  if (!view.configured) {
    return (
      <section className="page workspace-page">
        <h1 className="page-title">{t('Workspace', 'Không gian làm việc')}</h1>
        <p className="muted">
          {t('Set the dev repo in Settings', 'Hãy đặt dev repo trong Cài đặt')}
        </p>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            navigateTo('settings')
          }}
        >
          {t('Open Settings', 'Mở Cài đặt')}
        </button>
      </section>
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
    <section className="page workspace-page">
      {warning === null ? null : (
        <p className="status warning" role="status">
          {warning}{' '}
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              setWarning(null)
            }}
          >
            {t('Dismiss', 'Bỏ qua')}
          </button>
        </p>
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
        <p className="muted">{t('No open tabs', 'Chưa có thẻ nào')}</p>
      ) : (
        <div className="workspace-body">
          {leftHidden ? (
            <button
              type="button"
              className="button ghost workspace-show-left"
              onClick={() => {
                setLeftHidden(false)
              }}
            >
              {t('Show files', 'Hiện tệp')}
            </button>
          ) : (
            <LeftPane
              key={tab.id}
              tabId={tab.id}
              onHide={() => {
                setLeftHidden(true)
              }}
            />
          )}
          <ClaudePane
            key={tab.id}
            tab={tab}
            selected={session}
            onSelect={(name) => {
              navigateToWorkspace(tab.id, name)
            }}
            onAdd={() => {
              void actions.addSession(tab.id)
            }}
            onClose={(name) => {
              void actions.closeSession(name)
              navigateToWorkspace(tab.id)
            }}
          />
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
