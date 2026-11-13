import type { WorkspaceTab } from '@workday/core'
import { useState } from 'react'
import { useChatViewEnabled, useWorkspace } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { ChatView } from './ChatView.js'
import { TerminalView } from './TerminalView.js'

// "MDP-1" / "claude2" -> "Claude"; "MDP-1~3" -> "Claude 3".
export function sessionLabel(name: string): string {
  const [, number] = name.split('~')
  return number === undefined ? 'Claude' : `Claude ${number}`
}

type Mode = 'chat' | 'terminal'

// The Chat / Terminal choice per session, kept for the life of the page.
const modes = new Map<string, Mode>()

interface ClaudePaneProps {
  readonly tab: WorkspaceTab
  readonly selected: string
  readonly onSelect: (session: string) => void
  readonly onAdd: () => void
  readonly onClose: (session: string) => void
}

// Every session of the open tab stays mounted (hidden) so its screen survives a switch.
export function ClaudePane({
  tab,
  selected,
  onSelect,
  onAdd,
  onClose,
}: ClaudePaneProps): React.JSX.Element {
  const chatEnabled = useChatViewEnabled()
  const workspace = useWorkspace()
  const [, setRevision] = useState(0)
  const modeOf = (name: string): Mode => (chatEnabled ? (modes.get(name) ?? 'chat') : 'terminal')
  const chooseMode = (name: string, mode: Mode): void => {
    modes.set(name, mode)
    setRevision((revision) => revision + 1)
  }
  const waitOf = (name: string): 'finished' | 'permission' | 'question' | null =>
    workspace.data?.sessions.find((view) => view.name === name)?.wait ?? null
  return (
    <div className="claude-pane">
      <div
        className="claude-sessions"
        role="tablist"
        aria-label={t('Claude sessions', 'Phiên Claude')}
      >
        {tab.sessions.map((name, index) => (
          <div key={name} className="claude-session" data-selected={name === selected}>
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
              <button
                type="button"
                className="workspace-tab-close"
                aria-label={t(`Close ${sessionLabel(name)}`, `Đóng ${sessionLabel(name)}`)}
                onClick={() => {
                  onClose(name)
                }}
              >
                x
              </button>
            )}
          </div>
        ))}
        {chatEnabled ? (
          <div className="segmented" role="group">
            {(['chat', 'terminal'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={modeOf(selected) === mode}
                onClick={() => {
                  chooseMode(selected, mode)
                }}
              >
                {mode === 'chat' ? 'Chat' : 'Terminal'}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="button ghost"
          aria-label={t('New Claude session', 'Phiên Claude mới')}
          onClick={onAdd}
        >
          +
        </button>
      </div>
      {tab.sessions.map((name) => (
        <div key={name} className="claude-stage" hidden={name !== selected}>
          <TerminalView
            session={name}
            visible={name === selected}
            concealed={modeOf(name) === 'chat'}
          />
          {name === selected && modeOf(name) === 'chat' ? (
            <ChatView
              session={name}
              wait={waitOf(name)}
              onOpenTerminal={() => {
                chooseMode(name, 'terminal')
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
