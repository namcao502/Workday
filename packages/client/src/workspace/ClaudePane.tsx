import { Button, CloseButton } from '@heroui/react'
import { Plus } from '@gravity-ui/icons'
import type { WorkspaceTab } from '@workday/core'
import { t } from '../i18n.js'
import { ChatView } from './ChatView.js'

// "MDP-1" / "claude2" -> "Claude"; "MDP-1~3" -> "Claude 3".
export function sessionLabel(name: string): string {
  const [, number] = name.split('~')
  return number === undefined ? 'Claude' : `Claude ${number}`
}

interface ClaudePaneProps {
  readonly tab: WorkspaceTab
  readonly active: boolean // false: another ticket tab is open; stay mounted but hidden
  readonly selected: string
  readonly onSelect: (session: string) => void
  readonly onAdd: () => void
  readonly onClose: (session: string) => void
}

// Every session stays mounted (hidden) so its scroll position and draft survive a switch, within a tab and between tabs.
export function ClaudePane({
  tab,
  active,
  selected,
  onSelect,
  onAdd,
  onClose,
}: ClaudePaneProps): React.JSX.Element {
  return (
    <div className={`h-full min-h-0 min-w-0 flex-[1_1_50%] flex-col ${active ? 'flex' : 'hidden'}`}>
      <div
        className="flex flex-wrap items-center gap-1 border-b border-separator pb-2"
        role="tablist"
        aria-label={t('Claude sessions', 'Phiên Claude')}
      >
        {tab.sessions.map((name, index) => (
          <div
            key={name}
            className={`flex h-8 items-center rounded-lg pl-3 text-sm ${
              index === 0 ? 'pr-3' : 'pr-1'
            }${name === selected ? ' bg-surface shadow-sm' : ''}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={name === selected}
              onClick={() => {
                onSelect(name)
              }}
            >
              {sessionLabel(name)}
            </button>
            {index === 0 ? null : (
              <CloseButton
                className="ml-1 size-6"
                aria-label={t(`Close ${sessionLabel(name)}`, `Đóng ${sessionLabel(name)}`)}
                onPress={() => {
                  onClose(name)
                }}
              />
            )}
          </div>
        ))}
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={t('New Claude session', 'Phiên Claude mới')}
          onPress={onAdd}
        >
          <Plus />
        </Button>
      </div>
      {tab.sessions.map((name) => (
        <div
          key={name}
          data-testid={`claude-session-${name}`}
          className="flex min-h-0 flex-1"
          hidden={!active || name !== selected}
        >
          <ChatView session={name} shown={active && name === selected} />
        </div>
      ))}
    </div>
  )
}
