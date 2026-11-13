import type { SessionView, WorkspaceTab } from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'

export function folderName(folder: string | null): string {
  if (folder === null) {
    return t('Dev repo', 'Dev repo')
  }
  const parts = folder.split(/[\\/]/).filter((part) => part !== '')
  return parts[parts.length - 1] ?? folder
}

export function tabLabel(tab: WorkspaceTab): string {
  return tab.kind === 'ticket' ? tab.id : folderName(tab.folder)
}

interface AddMenuProps {
  readonly recentFolders: readonly string[]
  readonly onAdd: (folder: string | null) => void
}

function AddTerminalMenu({ recentFolders, onAdd }: AddMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const [path, setPath] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }
    function closeOnOutsideClick(event: MouseEvent): void {
      if (event.target instanceof Node && containerRef.current?.contains(event.target) !== true) {
        setOpen(false)
        setTyping(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [open])

  function pick(folder: string | null): void {
    setOpen(false)
    setTyping(false)
    setPath('')
    onAdd(folder)
  }

  return (
    <div className="row-menu" ref={containerRef}>
      <button
        type="button"
        className="wd-button ghost"
        aria-label={t('New terminal', 'Terminal mới')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen)
        }}
      >
        +
      </button>
      {open ? (
        <div className="wd-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="wd-menu-item"
            onClick={() => {
              pick(null)
            }}
          >
            {t('Dev repo', 'Dev repo')}
          </button>
          {recentFolders.map((folder) => (
            <button
              key={folder}
              type="button"
              role="menuitem"
              className="wd-menu-item"
              title={folder}
              onClick={() => {
                pick(folder)
              }}
            >
              {folderName(folder)}
            </button>
          ))}
          {typing ? (
            <form
              className="menu-path"
              onSubmit={(event) => {
                event.preventDefault()
                if (path.trim() !== '') {
                  pick(path.trim())
                }
              }}
            >
              <input
                className="wd-input"
                autoFocus
                aria-label={t('Folder path', 'Đường dẫn thư mục')}
                value={path}
                onChange={(event) => {
                  setPath(event.target.value)
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="wd-menu-item"
              onClick={() => {
                setTyping(true)
              }}
            >
              {t('Choose another folder...', 'Chọn thư mục khác...')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

interface WorkspaceTabsProps {
  readonly tabs: readonly WorkspaceTab[]
  readonly sessions: readonly SessionView[]
  readonly selectedId: string | null
  readonly recentFolders: readonly string[]
  readonly onSelect: (tabId: string) => void
  readonly onClose: (tab: WorkspaceTab) => void
  readonly onAddTerminal: (folder: string | null) => void
}

export function WorkspaceTabs(props: WorkspaceTabsProps): React.JSX.Element {
  const waiting = new Set(
    props.sessions.filter((session) => session.wait !== null).map((session) => session.name),
  )
  return (
    <div
      className="workspace-tabs"
      role="tablist"
      aria-label={t('Workspace tabs', 'Thẻ không gian làm việc')}
    >
      {props.tabs.map((tab) => (
        <div key={tab.id} className="workspace-tab" data-selected={tab.id === props.selectedId}>
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === props.selectedId}
            className="workspace-tab-label"
            title={tab.folder ?? undefined}
            onClick={() => {
              props.onSelect(tab.id)
            }}
          >
            {tabLabel(tab)}
            {tab.sessions.some((name) => waiting.has(name)) ? (
              <span className="nav-dot" data-testid="tab-dot" aria-hidden="true" />
            ) : null}
          </button>
          <button
            type="button"
            className="workspace-tab-close"
            aria-label={t(`Close ${tabLabel(tab)}`, `Đóng ${tabLabel(tab)}`)}
            onClick={() => {
              props.onClose(tab)
            }}
          >
            x
          </button>
        </div>
      ))}
      <AddTerminalMenu recentFolders={props.recentFolders} onAdd={props.onAddTerminal} />
    </div>
  )
}
