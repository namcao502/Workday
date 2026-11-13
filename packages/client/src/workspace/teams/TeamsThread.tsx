import type { TeamsMessage, TeamsThread as TeamsThreadData } from '@workday/core'
import { useEffect, useRef, type ReactNode } from 'react'
import { TeamsMessageRow } from './TeamsMessageRow.js'

export interface TeamsThreadActions {
  readonly onReact: (message: TeamsMessage, key: string) => void
  readonly onAskClaude: (message: TeamsMessage) => void
  readonly onEdit: (message: TeamsMessage) => void
  readonly onDelete: (message: TeamsMessage) => void
}

interface TeamsThreadProps extends TeamsThreadActions {
  readonly thread: TeamsThreadData
  readonly myId: string
  readonly timeZone: string
  readonly locked: boolean
  readonly editingId: string | null
  readonly renderEditor: (message: TeamsMessage) => ReactNode // replaces the row being edited
}

export function TeamsThread({
  thread,
  myId,
  timeZone,
  locked,
  editingId,
  renderEditor,
  onReact,
  onAskClaude,
  onEdit,
  onDelete,
}: TeamsThreadProps): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)
  const count = thread.messages.length
  // Scroll only when the message count changes, so a reaction does not jump the view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [count, thread.conversationId])

  return (
    <div className="teams-thread">
      {thread.messages.map((message) =>
        message.id === editingId ? (
          <div key={message.id}>{renderEditor(message)}</div>
        ) : (
          <TeamsMessageRow
            key={message.id}
            message={message}
            myId={myId}
            timeZone={timeZone}
            locked={locked}
            onReact={(key) => {
              onReact(message, key)
            }}
            onAskClaude={() => {
              onAskClaude(message)
            }}
            onEdit={() => {
              onEdit(message)
            }}
            onDelete={() => {
              onDelete(message)
            }}
          />
        ),
      )}
      <div ref={endRef} />
    </div>
  )
}
