import { ArrowDown } from '@gravity-ui/icons'
import { Button, Dropdown, Spinner } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { AgentModel, AgentRewind, ChatAnswer, ChatMessage, UsageWindow } from '@workday/core'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { chatKey, useChat, useRefreshFilesAfterTurn } from '../api/useWorkspace.js'
import { answerRequest, rewindFiles, setSessionModel } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { ChatFileLinks } from './chatFileLinks.js'
import { ChatComposer, type ChatQuoteRequest } from './ChatComposer.js'
import { SelectionQuote } from './SelectionQuote.js'
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
      {t('workspace.usage')}:{' '}
      <span className={usageTone(window.percent)}>{String(Math.round(window.percent))}%</span>
      {reset === null ? null : (
        <span className="opacity-70">
          {' '}
          ({t('workspace.resets')} {reset})
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
        aria-label={t('workspace.switchModel')}
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
  let message = t('workspace.checkingWhatWouldChange')
  if (failed) {
    message = t('workspace.couldNotRewindTheFiles')
  } else if (preview !== null && !preview.canRewind) {
    message = t('workspace.cannotRewindToThisMessage', {
      reason: preview.error ?? t('workspace.unknownReason'),
    })
  } else if (preview !== null) {
    message = t('workspace.putFileSBackToHow', {
      files: String(preview.files),
      insertions: String(preview.insertions),
      deletions: String(preview.deletions),
    })
  }
  return (
    <div
      className="mx-2 flex flex-wrap items-center gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-sm"
      role="alertdialog"
      aria-label={t('workspace.rewindFiles')}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {blocked || preview === null ? null : (
        <Button size="sm" variant="danger" isDisabled={busy} onPress={onConfirm}>
          {t('workspace.rewind')}
        </Button>
      )}
      <Button size="sm" variant="secondary" onPress={onCancel}>
        {blocked ? t('workspace.close') : t('workspace.cancel')}
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
  useRefreshFilesAfterTurn(tabId, working)
  const [quote, setQuote] = useState<ChatQuoteRequest | null>(null)
  const background = chat.data?.background ?? []
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
    <ChatFileLinks tabId={tabId}>
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={listRef}
            data-testid="chat-list"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2"
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
                {t('workspace.earlierMessagesAreNotShown')}
              </p>
            ) : null}
            {chat.data === undefined ? (
              <p className="text-center text-sm text-muted" role="status">
                {t('workspace.loadingTheConversation')}
              </p>
            ) : null}
            {empty ? (
              <p className="m-auto max-w-sm text-center text-sm text-muted" role="status">
                {running
                  ? t('workspace.claudeIsStarting')
                  : t('workspace.noConversationYetSendAMessage')}
              </p>
            ) : null}
            <ChatRows
              messages={messages ?? []}
              {...(running && !working ? { onRewind: startRewind } : {})}
            />
            {echoed.map((text, index) => (
              <div
                key={`echo-${String(index)}-${text}`}
                className="max-w-[80%] self-end rounded-2xl bg-accent-soft px-3 py-1.5 text-sm whitespace-pre-wrap wrap-anywhere"
              >
                {text}
              </div>
            ))}
            {resumable ? (
              <p
                className="rounded-2xl bg-surface-secondary px-3 py-2 text-center text-xs text-muted"
                role="status"
              >
                {t('workspace.thisIsTheHistoryOfAn')}
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
              aria-label={t('workspace.goToTheLatestMessage')}
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
        {/* The turn can end while a subagent or shell it started keeps going; say so, or the chat looks idle. */}
        {working || background.length === 0 ? null : (
          <div
            role="status"
            aria-label={t('workspace.runningInTheBackground')}
            className="flex min-w-0 items-center gap-2 px-3 pb-1 text-xs text-muted"
          >
            <Spinner size="sm" />
            <span className="truncate">
              {t('workspace.runningInTheBackground')}: {background.join(', ')}
            </span>
          </div>
        )}
        <SelectionQuote
          list={listRef}
          onQuote={(text) => {
            setQuote((last) => ({ text, id: (last?.id ?? 0) + 1 }))
          }}
        />
        <ChatComposer
          quote={quote}
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
              {t('workspace.tokens')}:{' '}
              <span className="font-semibold text-foreground">{formatTokens(tokens)}</span>
              {usage === null || usage.contextPercent === null
                ? ''
                : ` (${String(Math.round(usage.contextPercent))}%)`}
            </span>
          )}
          {usage === null || usage.usage === null ? null : <UsageStat window={usage.usage} />}
          {mode === 'bypassPermissions' ? <span>{t('workspace.bypassPermissionsOn')}</span> : null}
        </div>
      </div>
    </ChatFileLinks>
  )
}
