import { useQueryClient } from '@tanstack/react-query'
import type { WaitReason } from '@workday/core'
import { useLayoutEffect, useRef, useState } from 'react'
import { chatKey, useChat } from '../api/useWorkspace.js'
import { sendKey, sendPrompt } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { ChatRows } from './ChatRows.js'

const BOTTOM_SLACK_PX = 24

interface ChatViewProps {
  readonly session: string
  readonly wait: WaitReason | null
  readonly onOpenTerminal: () => void
}

// The transcript as a chat, plus a box that types into the session's terminal.
export function ChatView({ session, wait, onOpenTerminal }: ChatViewProps): React.JSX.Element {
  const chat = useChat(session, true)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [failed, setFailed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const messages = chat.data?.messages
  const working = chat.data?.working === true

  // Stick to the bottom only while the reader is there.
  useLayoutEffect(() => {
    const list = listRef.current
    if (list !== null && atBottom.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, working, wait])

  async function send(action: () => Promise<void>): Promise<void> {
    try {
      await action()
      setFailed(false)
    } catch {
      setFailed(true)
    }
    await queryClient.invalidateQueries({ queryKey: chatKey(session) })
  }

  function submit(): void {
    const prompt = text.trim()
    if (prompt === '') {
      return
    }
    setText('')
    void send(() => sendPrompt(session, prompt))
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      void send(() => sendKey(session, 'escape'))
    } else if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault()
      void send(() => sendKey(session, 'shiftTab'))
    }
  }

  return (
    <div className="chat-view">
      <div
        ref={listRef}
        className="chat-list"
        onScroll={(event) => {
          const list = event.currentTarget
          atBottom.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < BOTTOM_SLACK_PX
        }}
      >
        {chat.data?.hasMore === true ? (
          <p className="muted">
            {t('Earlier messages are not shown.', 'Tin nhắn cũ hơn không hiển thị.')}
          </p>
        ) : null}
        <ChatRows messages={messages ?? []} />
        {working ? (
          <div className="chat-working">
            <span className="spinner" aria-hidden="true" />
            {t('Claude is working...', 'Claude đang làm việc...')}
          </div>
        ) : null}
        {wait === 'permission' || wait === 'question' ? (
          <div className="chat-wait" role="alert">
            <span>
              {t(
                'Claude needs your answer in the terminal',
                'Claude cần bạn trả lời trong terminal',
              )}
            </span>
            <button type="button" className="button" onClick={onOpenTerminal}>
              {t('Open terminal', 'Mở terminal')}
            </button>
          </div>
        ) : null}
      </div>
      {failed ? <p className="error-text">{t('Could not send.', 'Không gửi được.')}</p> : null}
      <textarea
        className="chat-input"
        rows={3}
        value={text}
        aria-label={t('Message to Claude', 'Tin nhắn cho Claude')}
        placeholder={t(
          'Enter to send, Shift+Enter for a new line',
          'Enter để gửi, Shift+Enter xuống dòng',
        )}
        onChange={(event) => {
          setText(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
