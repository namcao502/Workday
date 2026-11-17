import type { TeamsMessage, TeamsThread as TeamsThreadData } from '@workday/core'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ImageViewer, type ViewerImage } from '../../ui/ImageViewer.js'
import { fullImageSrc } from './teamsContent.js'
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
  const listRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<{
    readonly images: readonly ViewerImage[]
    readonly start: number
  } | null>(null)
  const count = thread.messages.length
  // Scroll only when the message count changes, so a reaction does not jump the view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [count, thread.conversationId])

  // A loaded picture of the thread opens in the viewer, with the thread's other pictures one key away.
  function openViewer(target: EventTarget): void {
    const list = listRef.current
    if (
      !(target instanceof HTMLImageElement) ||
      list === null ||
      !target.closest('.teams-content')
    ) {
      return
    }
    const loaded = [...list.querySelectorAll<HTMLImageElement>('.teams-content img')].filter(
      (image) => image.complete && image.naturalWidth !== 0,
    )
    const start = loaded.indexOf(target)
    if (start !== -1) {
      setViewer({
        images: loaded.map((image) => ({ src: image.src, fullSrc: fullImageSrc(image) })),
        start,
      })
    }
  }

  return (
    <div
      ref={listRef}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2 pr-3"
      onClick={(event) => {
        openViewer(event.target)
      }}
    >
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
      {viewer === null ? null : (
        <ImageViewer
          images={viewer.images}
          startIndex={viewer.start}
          onClose={() => {
            setViewer(null)
          }}
        />
      )}
    </div>
  )
}
