import type { SessionView, WorkspaceTab } from '@workday/core'
import { Button, CloseButton, Dropdown } from '@heroui/react'
import { Plus } from '@gravity-ui/icons'
import { useState } from 'react'
import { t } from '../i18n.js'
import { FolderPickerDialog } from './FolderPickerDialog.js'
import { Tip } from '../ui/Tip.js'

export function folderName(folder: string | null): string {
  if (folder === null) {
    return t('workspace.devRepo')
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
        <Button isIconOnly variant="secondary" size="sm" aria-label={t('workspace.newTerminal')}>
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
              textValue={t('workspace.chooseAnotherFolder')}
              onAction={() => {
                setPicking(true)
              }}
            >
              {t('workspace.chooseAnotherFolder')}
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
  readonly onMove: (tabId: string, index: number) => void // drag a tab onto another to take its place
}

// The strip does not wrap or show a scrollbar; the open tab is brought into view instead.
function scrollIntoView(element: HTMLElement | null): void {
  // jsdom has no scrollIntoView, so the call is guarded.
  if (element !== null && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

export function WorkspaceTabs(props: WorkspaceTabsProps): React.JSX.Element {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const waiting = new Set(
    props.sessions.filter((session) => session.wait !== null).map((session) => session.name),
  )
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        role="tablist"
        aria-label={t('workspace.workspaceTabs')}
      >
        {props.tabs.map((tab, index) => {
          const selected = tab.id === props.selectedId
          return (
            <div
              key={tab.id}
              ref={selected ? scrollIntoView : undefined}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', tab.id)
                setDragging(tab.id)
              }}
              onDragOver={(event) => {
                if (dragging !== null && dragging !== tab.id) {
                  event.preventDefault()
                  setOver(tab.id)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging !== null && dragging !== tab.id) {
                  props.onMove(dragging, index)
                }
                setDragging(null)
                setOver(null)
              }}
              onDragEnd={() => {
                setDragging(null)
                setOver(null)
              }}
              className={`flex h-8 shrink-0 items-center min-[720px]:w-40 min-[720px]:min-w-24 min-[720px]:shrink rounded-full pl-3.5 pr-1 text-sm transition-colors duration-150${
                over === tab.id ? ' bg-default' : ''
              }${dragging === tab.id ? ' opacity-50' : ''}${
                selected
                  ? ' bg-accent-soft text-accent-soft-foreground'
                  : ' bg-surface-secondary text-muted hover:text-foreground'
              }`}
            >
              <Tip className="flex min-w-0 flex-1" content={tab.folder ?? tabLabel(tab)}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="flex w-full min-w-0 items-center gap-1.5"
                  onClick={() => {
                    props.onSelect(tab.id)
                  }}
                >
                  <span className="truncate">{tabLabel(tab)}</span>
                  {tab.sessions.some((name) => waiting.has(name)) ? (
                    <span
                      className="size-2 flex-none rounded-full bg-danger"
                      data-testid="tab-dot"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              </Tip>
              <CloseButton
                className="ml-1 size-6 hover:bg-danger hover:text-danger-foreground"
                aria-label={t('workspace.close5', { tab: tabLabel(tab) })}
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
