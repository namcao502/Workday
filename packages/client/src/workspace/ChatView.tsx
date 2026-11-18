import { ArrowDown } from '@gravity-ui/icons'
import { Button, Dropdown } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { AgentModel, AgentRewind, ChatAnswer, ChatMessage, UsageWindow } from '@workday/core'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { chatKey, useChat } from '../api/useWorkspace.js'
import { answerRequest, rewindFiles, setSessionModel } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { ChatComposer } from './ChatComposer.js'
import { ChatRequestCard } from './ChatRequestCard.js'
import { ChatRows } from './ChatRows.js'
import { addEcho, dropEchoes, useEchoes } from './promptEchoes.js'

const BOTTOM_SLACK_PX = 24

// The user's own prompts, oldest first, without the repeats of a row that was sent twice in a row.
function userPrompts(messages: readonly ChatMessage[]): readonly string[] {
  const prompts: string[] = []
  for (const message of messages) {
    const text = message.role === 'user' ? (message.text ?? '').trim() : ''
    if (text !== '' && prompts.at(-1) !== text) {
      prompts.push(text)
    }
  }
  return prompts
}
const TOKENS_PER_K = 1000

// "Tue Nov 17, 5:00 PM" for a reset after today, "5:00 PM" for one today.
function formatReset(iso: string | null): string | null {
  if (iso === null) {
    return null
  }
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) {
    return null
  }
  const sameDay = at.toDateString() === new Date().toDateString()
  return at.toLocaleString('en-US', {
    ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  })
}

// The terminal status line's thresholds: red from 90%, yellow from 70%, else green.
function usageTone(percent: number): string {
  if (percent >= 90) {
    return 'text-danger'
  }
  return percent >= 70 ? 'text-warning' : 'text-success'
}

function UsageStat({ window }: { readonly window: UsageWindow }): React.JSX.Element {
  const reset = formatReset(window.resetsAt)
  return (
    <span>
      {t('Usage', 'Mức dùng')}:{' '}
      <span className={usageTone(window.percent)}>{String(Math.round(window.percent))}%</span>
      {reset === null ? null : (
        <span className="opacity-70">
          {' '}
          ({t('resets', 'đặt lại')} {reset})
        </span>
      )}
    </span>
  )
}

// 75500 -> "75.5K"; small counts stay whole.
function formatTokens(count: number): string {
  return count < TOKENS_PER_K ? String(count) : `${(count / TOKENS_PER_K).toFixed(1)}K`
}

interface ModelPickerProps {
  readonly session: string
  readonly model: string
  readonly models: readonly AgentModel[]
  readonly disabled: boolean
}

// The model name; a menu to switch it once the session has reported what it offers.
function ModelPicker({ session, model, models, disabled }: ModelPickerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const name = <span className="font-semibold text-accent">{model}</span>
  if (models.length === 0) {
    return name
  }
  return (
    <Dropdown>
      <Button
        size="sm"
        variant="secondary"
        aria-label={t('Switch model', 'Đổi model')}
        isDisabled={disabled}
      >
        {name}
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          onAction={(key) => {
            void setSessionModel(session, String(key))
              .catch(() => undefined)
              .then(() => queryClient.invalidateQueries({ queryKey: chatKey(session) }))
          }}
        >
          {models.map((item) => (
            <Dropdown.Item key={item.value} id={item.value} textValue={item.label}>
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

interface RewindState {
  readonly uuid: string
  readonly preview: AgentRewind | null
  readonly failed: boolean
  readonly busy: boolean
}

interface RewindCardProps {
  readonly rewind: RewindState
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

// The question before files are put back, or the reason they cannot be.
function RewindCard({ rewind, onConfirm, onCancel }: RewindCardProps): React.JSX.Element {
  const { preview, failed, busy } = rewind
  const blocked = failed || (preview !== null && !preview.canRewind)
  let message = t('Checking what would change...', 'Đang kiểm tra những gì sẽ đổi...')
  if (failed) {
    message = t('Could not rewind the files.', 'Không hoàn tác được file.')
  } else if (preview !== null && !preview.canRewind) {
    message = t(
      `Cannot rewind to this message: ${preview.error ?? 'unknown reason'}`,
      `Không thể hoàn tác về tin nhắn này: ${preview.error ?? 'không rõ lý do'}`,
    )
  } else if (preview !== null) {
    message = t(
      `Put ${String(preview.files)} file(s) back to how they were at this message (+${String(preview.insertions)} -${String(preview.deletions)})? Changes made since will be lost.`,
      `Đưa ${String(preview.files)} file về trạng thái lúc tin nhắn này (+${String(preview.insertions)} -${String(preview.deletions)})? Các thay đổi sau đó sẽ mất.`,
    )
  }
  return (
    <div
      className="mx-2 flex flex-wrap items-center gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-sm"
      role="alertdialog"
      aria-label={t('Rewind files', 'Hoàn tác file')}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {blocked || preview === null ? null : (
        <Button size="sm" variant="danger" isDisabled={busy} onPress={onConfirm}>
          {t('Rewind', 'Hoàn tác')}
        </Button>
      )}
      <Button size="sm" variant="secondary" onPress={onCancel}>
        {blocked ? t('Close', 'Đóng') : t('Cancel', 'Hủy')}
      </Button>
    </div>
  )
}

interface ChatViewProps {
  readonly session: string
  readonly tabId: string // the files the @ menu lists belong to the tab
  readonly shown?: boolean // false: stay mounted, do not fetch
}

// One session: mode / model / status header, the transcript, open requests and the composer.
export function ChatView({ session, tabId, shown = true }: ChatViewProps): React.JSX.Element {
  const chat = useChat(session, shown)
  const queryClient = useQueryClient()
  const [answering, setAnswering] = useState(false)
  const [rewind, setRewind] = useState<RewindState | null>(null)
  const queued = useEchoes(session)
  const echoBase = useRef<number | null>(null) // user rows in the transcript when the first echo arrived
  const listRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [awayFromBottom, setAwayFromBottom] = useState(false)
  const messages = chat.data?.messages
  const requests = chat.data?.requests
  const userCount = (messages ?? []).filter((message) => message.role === 'user').length
  if (queued.length !== 0 && echoBase.current === null) {
    echoBase.current = userCount
  }
  const consumed = echoBase.current === null ? 0 : Math.max(userCount - echoBase.current, 0)
  const echoed = queued.slice(consumed)
  const prompts = useMemo(() => userPrompts(messages ?? []), [messages])
  const working = chat.data?.working === true
  const model = chat.data?.model ?? null
  const running = chat.data?.running === true
  const mode = chat.data?.mode
  const branch = chat.data?.branch ?? null
  const added = chat.data?.added ?? 0
  const removed = chat.data?.removed ?? 0
  const tokens = chat.data?.contextTokens ?? null
  const usage = chat.data?.usage ?? null
  const empty = chat.data !== undefined && messages?.length === 0 && (requests?.length ?? 0) === 0
  // History is shown from the session's transcript even before Claude is started; the first prompt resumes it.
  const resumable = chat.data !== undefined && !running && (messages?.length ?? 0) !== 0

  // Stick to the bottom only while the reader is there.
  useLayoutEffect(() => {
    const list = listRef.current
    if (list !== null && atBottom.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, working, requests, shown, echoed.length])

  // The transcript has taken over the first `consumed` echoes.
  useEffect(() => {
    if (consumed !== 0) {
      dropEchoes(session, consumed)
      echoBase.current = consumed >= queued.length ? null : (echoBase.current ?? 0) + consumed
    }
  }, [consumed, queued.length, session])

  async function settle(action: () => Promise<void>): Promise<void> {
    try {
      await action()
    } catch {
      // The refetch below shows the real state; a stale request card disappears with it.
    }
    await queryClient.invalidateQueries({ queryKey: chatKey(session) })
  }

  // Previews the rewind first; the files are only touched after the user confirms.
  function startRewind(uuid: string): void {
    setRewind({ uuid, preview: null, failed: false, busy: true })
    void rewindFiles(session, uuid, true)
      .then((preview) => {
        setRewind({ uuid, preview, failed: false, busy: false })
      })
      .catch(() => {
        setRewind({ uuid, preview: null, failed: true, busy: false })
      })
  }

  function confirmRewind(): void {
    if (rewind === null) {
      return
    }
    const { uuid } = rewind
    setRewind({ ...rewind, busy: true })
    void rewindFiles(session, uuid, false)
      .then((done) => {
        setRewind(done.canRewind ? null : { uuid, preview: done, failed: false, busy: false })
      })
      .catch(() => {
        setRewind({ uuid, preview: null, failed: true, busy: false })
      })
  }

  function answer(id: string, response: ChatAnswer): void {
    setAnswering(true)
    void settle(() => answerRequest(session, id, response)).finally(() => {
      setAnswering(false)
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          data-testid="chat-list"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
          onScroll={(event) => {
            const list = event.currentTarget
            // A hidden list reports 0 for everything: that says nothing about where the reader was.
            if (list.clientHeight === 0) {
              return
            }
            atBottom.current =
              list.scrollHeight - list.scrollTop - list.clientHeight < BOTTOM_SLACK_PX
            setAwayFromBottom(!atBottom.current)
          }}
        >
          {chat.data?.hasMore === true ? (
            <p className="text-center text-xs text-muted">
              {t('Earlier messages are not shown.', 'Tin nhắn cũ hơn không hiển thị.')}
            </p>
          ) : null}
          {chat.data === undefined ? (
            <p className="text-center text-sm text-muted" role="status">
              {t('Loading the conversation...', 'Đang tải cuộc trò chuyện...')}
            </p>
          ) : null}
          {empty ? (
            <p className="m-auto max-w-sm text-center text-sm text-muted" role="status">
              {running
                ? t('Claude is starting...', 'Claude đang khởi động...')
                : t(
                    'No conversation yet. Send a message to start one.',
                    'Chưa có cuộc trò chuyện. Gửi một tin nhắn để bắt đầu.',
                  )}
            </p>
          ) : null}
          <ChatRows
            messages={messages ?? []}
            {...(running && !working ? { onRewind: startRewind } : {})}
          />
          {echoed.map((text, index) => (
            <div
              key={`echo-${String(index)}-${text}`}
              className="max-w-[80%] self-end rounded-2xl bg-accent-soft px-3 py-1.5 text-sm whitespace-pre-wrap"
            >
              {text}
            </div>
          ))}
          {resumable ? (
            <p
              className="rounded-2xl bg-surface-secondary px-3 py-2 text-center text-xs text-muted"
              role="status"
            >
              {t(
                'This is the history of an earlier session. Send a message to continue it.',
                'Đây là lịch sử của phiên trước. Gửi một tin nhắn để nối tiếp.',
              )}
            </p>
          ) : null}
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
        {awayFromBottom ? (
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            className="absolute bottom-3 right-4 rounded-full shadow-overlay"
            aria-label={t('Go to the latest message', 'Tới tin nhắn mới nhất')}
            onPress={() => {
              const list = listRef.current
              if (list !== null) {
                list.scrollTop = list.scrollHeight
                atBottom.current = true
                setAwayFromBottom(false)
              }
            }}
          >
            <ArrowDown />
          </Button>
        ) : null}
      </div>
      {rewind === null ? null : (
        <RewindCard
          rewind={rewind}
          onConfirm={confirmRewind}
          onCancel={() => {
            setRewind(null)
          }}
        />
      )}
      <ChatComposer
        session={session}
        tabId={tabId}
        commands={chat.data?.catalog?.commands ?? []}
        working={working}
        history={prompts}
        onSending={(text) => {
          addEcho(session, text)
        }}
        onSendFailed={() => {
          dropEchoes(session)
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-1 text-xs text-muted">
        {model === null ? null : (
          <ModelPicker
            session={session}
            model={model}
            models={chat.data?.catalog?.models ?? []}
            disabled={working}
          />
        )}
        {branch === null ? null : <span className="text-purple-500">{branch}</span>}
        {added === 0 && removed === 0 ? null : (
          <span>
            <span className="text-success">+{added}</span>{' '}
            <span className="text-danger">-{removed}</span>
          </span>
        )}
        {tokens === null ? null : (
          <span>
            {t('Tokens', 'Token')}:{' '}
            <span className="font-semibold text-foreground">{formatTokens(tokens)}</span>
            {usage === null || usage.contextPercent === null
              ? ''
              : ` (${String(Math.round(usage.contextPercent))}%)`}
          </span>
        )}
        {usage === null || usage.usage === null ? null : <UsageStat window={usage.usage} />}
        {mode === 'bypassPermissions' ? (
          <span>{t('Bypass permissions on', 'Đang bỏ qua quyền')}</span>
        ) : null}
      </div>
    </div>
  )
}
