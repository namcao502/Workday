import { Spinner } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { ChatAnswer } from '@workday/core'
import { useLayoutEffect, useRef, useState } from 'react'
import { chatKey, useChat } from '../api/useWorkspace.js'
import { answerRequest, setSessionMode } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { ChatComposer } from './ChatComposer.js'
import { ChatRequestCard } from './ChatRequestCard.js'
import { ChatRows } from './ChatRows.js'
import { ModeSelect } from './ModeSelect.js'

const BOTTOM_SLACK_PX = 24

interface ChatViewProps {
  readonly session: string
  readonly shown?: boolean // false: stay mounted, do not fetch
}

// One session: mode / model / status header, the transcript, open requests and the composer.
export function ChatView({ session, shown = true }: ChatViewProps): React.JSX.Element {
  const chat = useChat(session, shown)
  const queryClient = useQueryClient()
  const [answering, setAnswering] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const messages = chat.data?.messages
  const requests = chat.data?.requests
  const working = chat.data?.working === true
  const model = chat.data?.model ?? null

  // Stick to the bottom only while the reader is there.
  useLayoutEffect(() => {
    const list = listRef.current
    if (list !== null && atBottom.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, working, requests])

  async function settle(action: () => Promise<void>): Promise<void> {
    try {
      await action()
    } catch {
      // The refetch below shows the real state; a stale request card disappears with it.
    }
    await queryClient.invalidateQueries({ queryKey: chatKey(session) })
  }

  function answer(id: string, response: ChatAnswer): void {
    setAnswering(true)
    void settle(() => answerRequest(session, id, response)).finally(() => {
      setAnswering(false)
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-separator px-2 py-1">
        <ModeSelect
          label={t('Permission mode', 'Chế độ quyền')}
          value={chat.data?.mode ?? 'default'}
          onChange={(mode) => {
            void settle(() => setSessionMode(session, mode))
          }}
        />
        {model === null ? null : <span className="text-xs text-muted">{model}</span>}
        {working ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted" role="status">
            <Spinner size="sm" aria-hidden="true" />
            {t('Working...', 'Đang làm việc...')}
          </span>
        ) : null}
      </div>
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
        onScroll={(event) => {
          const list = event.currentTarget
          atBottom.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < BOTTOM_SLACK_PX
        }}
      >
        {chat.data?.hasMore === true ? (
          <p className="text-center text-xs text-muted">
            {t('Earlier messages are not shown.', 'Tin nhắn cũ hơn không hiển thị.')}
          </p>
        ) : null}
        <ChatRows messages={messages ?? []} />
        {(requests ?? []).map((request) => (
          <ChatRequestCard
            key={request.id}
            request={request}
            busy={answering}
            onAnswer={(response) => {
              answer(request.id, response)
            }}
          />
        ))}
      </div>
      <ChatComposer session={session} working={working} />
    </div>
  )
}
