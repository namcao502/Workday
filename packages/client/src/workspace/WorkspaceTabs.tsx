import type { SessionView, WorkspaceTab } from '@workday/core'
import { Badge, Button, CloseButton, Dropdown } from '@heroui/react'
import { Plus } from '@gravity-ui/icons'
import { useState } from 'react'
import { t } from '../i18n.js'
import { FolderPickerDialog } from './FolderPickerDialog.js'

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
  const [picking, setPicking] = useState(false)

  function pick(folder: string | null): void {
    setPicking(false)
    onAdd(folder)
  }

  const folders: readonly { readonly id: string; readonly folder: string | null }[] = [
    { id: 'dev-repo', folder: null },
    ...recentFolders.map((folder) => ({ id: `recent:${folder}`, folder })),
  ]
  return (
    <div className="flex items-center gap-1">
      <Dropdown>
        <Button
          isIconOnly
          variant="secondary"
          size="sm"
          aria-label={t('New terminal', 'Terminal mới')}
        >
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
                setPicking(true)
              }}
            >
              {t('Choose another folder...', 'Chọn thư mục khác...')}
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {picking ? (
        <FolderPickerDialog
          startPath={recentFolders[0] ?? null}
          onChoose={pick}
          onClose={() => {
            setPicking(false)
          }}
        />
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

// The strip does not wrap or show a scrollbar; the open tab is brought into view instead.
function scrollIntoView(element: HTMLElement | null): void {
  // jsdom has no scrollIntoView, so the call is guarded.
  if (element !== null && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

export function WorkspaceTabs(props: WorkspaceTabsProps): React.JSX.Element {
  const waiting = new Set(
    props.sessions.filter((session) => session.wait !== null).map((session) => session.name),
  )
  return (
    <div className="flex min-w-0 items-center gap-1 pb-2">
      <div
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        role="tablist"
        aria-label={t('Workspace tabs', 'Thẻ không gian làm việc')}
      >
        {props.tabs.map((tab) => {
          const selected = tab.id === props.selectedId
          return (
            <div
              key={tab.id}
              ref={selected ? scrollIntoView : undefined}
              className={`flex h-8 w-40 min-w-24 shrink items-center rounded-full pl-3.5 pr-1 text-sm transition-colors duration-150${
                selected
                  ? ' bg-accent-soft text-accent-soft-foreground'
                  : ' bg-surface-secondary text-muted hover:text-foreground'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className="flex min-w-0 flex-1 items-center gap-1.5"
                title={tab.folder ?? tabLabel(tab)}
                onClick={() => {
                  props.onSelect(tab.id)
                }}
              >
                <span className="truncate">{tabLabel(tab)}</span>
                {tab.sessions.some((name) => waiting.has(name)) ? (
                  <Badge color="danger" size="sm" data-testid="tab-dot" aria-hidden="true" />
                ) : null}
              </button>
              <CloseButton
                className="ml-1 size-6 hover:bg-danger hover:text-danger-foreground"
                aria-label={t(`Close ${tabLabel(tab)}`, `Đóng ${tabLabel(tab)}`)}
                onPress={() => {
                  props.onClose(tab)
                }}
              />
            </div>
          )
        })}
      </div>
      <AddTerminalMenu recentFolders={props.recentFolders} onAdd={props.onAddTerminal} />
    </div>
  )
}
