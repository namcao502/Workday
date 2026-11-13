import type { SessionView, WorkspaceTab } from '@workday/core'
import { Badge, Button, CloseButton, Dropdown, Input } from '@heroui/react'
import { Plus } from '@gravity-ui/icons'
import { useState } from 'react'
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
  const [typing, setTyping] = useState(false)
  const [path, setPath] = useState('')

  function pick(folder: string | null): void {
    setTyping(false)
    setPath('')
    onAdd(folder)
  }

  const folders: readonly { readonly id: string; readonly folder: string | null }[] = [
    { id: 'dev-repo', folder: null },
    ...recentFolders.map((folder) => ({ id: `recent:${folder}`, folder })),
  ]
  return (
    <div className="flex items-center gap-1">
      <Dropdown>
        <Button isIconOnly variant="ghost" size="sm" aria-label={t('New terminal', 'Terminal mới')}>
          <Plus />
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu>
            {folders.map((item) => (
              <Dropdown.Item
                key={item.id}
                id={item.id}
                textValue={folderName(item.folder)}
                onAction={() => {
                  pick(item.folder)
                }}
              >
                {folderName(item.folder)}
              </Dropdown.Item>
            ))}
            <Dropdown.Item
              id="choose"
              textValue={t('Choose another folder...', 'Chọn thư mục khác...')}
              onAction={() => {
                setTyping(true)
              }}
            >
              {t('Choose another folder...', 'Chọn thư mục khác...')}
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {typing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (path.trim() !== '') {
              pick(path.trim())
            }
          }}
        >
          <Input
            variant="secondary"
            autoFocus
            aria-label={t('Folder path', 'Đường dẫn thư mục')}
            value={path}
            onChange={(event) => {
              setPath(event.target.value)
            }}
            onBlur={() => {
              setTyping(false)
            }}
          />
        </form>
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
      className="flex flex-wrap items-center gap-1 border-b border-separator pb-2"
      role="tablist"
      aria-label={t('Workspace tabs', 'Thẻ không gian làm việc')}
    >
      {props.tabs.map((tab) => {
        const selected = tab.id === props.selectedId
        return (
          <div
            key={tab.id}
            className={`flex h-8 items-center rounded-lg pl-3 pr-1 text-sm${
              selected ? ' bg-surface shadow-sm' : ''
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              className="flex items-center gap-1.5"
              title={tab.folder ?? undefined}
              onClick={() => {
                props.onSelect(tab.id)
              }}
            >
              {tabLabel(tab)}
              {tab.sessions.some((name) => waiting.has(name)) ? (
                <Badge color="danger" size="sm" data-testid="tab-dot" aria-hidden="true" />
              ) : null}
            </button>
            <CloseButton
              className="ml-1 size-6"
              aria-label={t(`Close ${tabLabel(tab)}`, `Đóng ${tabLabel(tab)}`)}
              onPress={() => {
                props.onClose(tab)
              }}
            />
          </div>
        )
      })}
      <AddTerminalMenu recentFolders={props.recentFolders} onAdd={props.onAddTerminal} />
    </div>
  )
}
