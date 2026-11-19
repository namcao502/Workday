import { Button, Spinner } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { paragraphsFromText, type TeamsMessage } from '@workday/core'
import { useEffect, useState } from 'react'
import {
  deleteMessage,
  handOffMessage,
  reactToMessage,
  teamsSignIn,
  type TeamsWrite,
} from '../../api/teamsApi.js'
import { useSettings } from '../../api/useSettings.js'
import { errorText } from '../../errors.js'
import { formatShortDate, getLanguage, t } from '../../i18n.js'
import { FindablePane } from '../../ui/FindablePane.js'
import {
  composeLabel,
  ConversationSelect,
  optionsOf,
  shownConversationId,
  StatePanel,
} from './TeamsPanels.js'
import { TeamsBugReplyCard } from './TeamsBugReplyCard.js'
import { TeamsEditBox, TeamsReplyBox, type LoadedReply } from './TeamsComposeParts.js'
import { addEcho, dropEchoes } from '../promptEchoes.js'
import { TeamsAnalysisPanel } from './TeamsAnalysisPanel.js'
import { TeamsPostCard } from './TeamsPostCard.js'
import { outcomeOf, type SendAction } from './teamsSend.js'
import { TeamsThread } from './TeamsThread.js'
import { useMarkTeamsSeen, useTeamsRead } from './useTeams.js'

// "Name is waiting since 3:05 PM" while the newest message is someone else's.
function waitingLineOf(
  last: TeamsMessage | undefined,
  myId: string,
  timeZone: string,
): string | null {
  if (last === undefined || last.senderId.toLowerCase() === myId.toLowerCase()) {
    return null
  }
  const at = new Date(last.sentAt)
  const language = getLanguage()
  const when = formatShortDate(at, language, timeZone)
  return t('teams.isWaitingSince', { senderName: last.senderName, when })
}

export interface TeamsViewProps {
  readonly ticket: string
  readonly conversation: string // '' = the default conversation
  readonly firstSession: string
  readonly visible: boolean
  readonly onPendingChange?: (pending: boolean) => void // the dot of the Teams tab
}

export function TeamsView({
  ticket,
  conversation,
  firstSession,
  visible,
  onPendingChange,
}: TeamsViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const timeZone = useSettings().data?.config.timeZone ?? 'UTC'
  const [selected, setSelected] = useState(conversation)
  const [writing, setWriting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loadedReply, setLoadedReply] = useState<LoadedReply | null>(null)
  const { data: view, isError, isFetching } = useTeamsRead(ticket, selected, { visible, writing })
  useMarkTeamsSeen(ticket, view, visible)
  const hasPending = view !== undefined && view.pending.length !== 0
  useEffect(() => {
    onPendingChange?.(hasPending)
  }, [hasPending, onPendingChange])

  // A notice pointing at another conversation changes the prop while the view stays mounted.
  useEffect(() => {
    setSelected(conversation)
  }, [conversation])

  // True when the write went through.
  async function run(action: () => Promise<TeamsWrite>): Promise<boolean> {
    setWriting(true)
    setProblem(null)
    let succeeded = false
    try {
      const result = await action()
      succeeded = result.ok
      if (!result.ok) {
        setProblem(errorText(result.error))
      }
      await queryClient.invalidateQueries({ queryKey: ['teams', ticket] })
    } catch {
      setProblem(t('teams.couldNotReachTheWorkdayServer'))
    } finally {
      setWriting(false)
    }
    return succeeded
  }

  // A composer send: the thread reads again afterwards. A lost connection counts as uncertain.
  const send: SendAction = async (action) => {
    setWriting(true)
    try {
      const result = await action()
      await queryClient.invalidateQueries({ queryKey: ['teams', ticket] })
      return outcomeOf(result)
    } catch {
      return {
        ok: false,
        message: t('teams.couldNotReachTheWorkdayServer'),
        uncertain: true,
      }
    } finally {
      setWriting(false)
    }
  }

  if (view === undefined) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className={isError ? 'py-2 text-sm text-danger' : 'py-2 text-sm text-muted'}>
          {isError ? t('teams.couldNotReadTeams') : t('teams.loading')}
        </p>
      </div>
    )
  }
  const options = optionsOf(view)
  const id = shownConversationId(view)
  const label = composeLabel(
    view,
    options.find((option) => option.id === id),
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex flex-wrap items-center gap-2 py-1.5">
        {options.length === 0 ? null : (
          <ConversationSelect
            options={options}
            value={id}
            pending={view.pending}
            onChange={setSelected}
          />
        )}
        {view.state === 'thread' ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              window.open(view.deepLink, '_blank', 'noopener')
            }}
          >
            {t('teams.openInTeams')}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onPress={() => {
            void queryClient.invalidateQueries({ queryKey: ['teams', ticket] })
          }}
        >
          {t('teams.refresh')}
        </Button>
        {/* A fixed-size slot: the 10 s background read must not change the header's layout. */}
        <span
          className="absolute right-1 top-2.5 flex size-5 items-center justify-center"
          role="status"
        >
          {isFetching ? <Spinner size="sm" aria-label={t('teams.reading')} /> : null}
        </span>
        {problem === null ? null : (
          <span className="min-w-0 basis-full text-sm text-danger" role="alert">
            {problem}
          </span>
        )}
      </div>
      <StatePanel
        view={view}
        writing={writing}
        onSignIn={() => {
          void run(teamsSignIn)
        }}
      />
      {view.state === 'thread' ? (
        // Ctrl+F finds in the thread like in a file; the thread scrolls itself to keep the newest in view.
        <FindablePane scrolls={false}>
          <TeamsThread
            thread={view.thread}
            myId={view.myId}
            timeZone={timeZone}
            locked={writing}
            editingId={editingId}
            renderEditor={(message) => (
              <TeamsEditBox
                ticket={ticket}
                conversationId={view.conversationId}
                message={message}
                isRoot={message.id === view.thread.rootId && !view.thread.isChat}
                people={view.people}
                locked={writing}
                send={send}
                onClose={() => {
                  setEditingId(null)
                }}
              />
            )}
            onReact={(message, key) => {
              void run(() => reactToMessage(ticket, view.conversationId, message.id, key))
            }}
            onAskClaude={(message) => {
              // The task file and the line to Claude take a moment; the chat shows the ask at once.
              addEcho(
                firstSession,
                t('teams.lookIntoTheTeamsMessageFrom', { senderName: message.senderName }),
              )
              void run(() =>
                handOffMessage(ticket, view.conversationId, message.id, firstSession),
              ).then((ok) => {
                if (!ok) {
                  dropEchoes(firstSession)
                }
              })
            }}
            onEdit={(message) => {
              setEditingId(message.id)
            }}
            onDelete={(message) => {
              void run(() => deleteMessage(ticket, view.conversationId, message.id))
            }}
          />
        </FindablePane>
      ) : null}
      {view.state === 'thread' ? (
        <div className="flex flex-col gap-2 py-2" data-testid="teams-compose-slot">
          <TeamsAnalysisPanel
            ticket={ticket}
            conversationId={view.conversationId}
            lastMessageId={view.thread.messages.at(-1)?.id ?? ''}
            session={firstSession}
            waitingLine={waitingLineOf(view.thread.messages.at(-1), view.myId, timeZone)}
            onUseReply={(text) => {
              setLoadedReply((current) => ({
                id: (current?.id ?? 0) + 1,
                html: paragraphsFromText(text),
                mentions: [],
              }))
            }}
          />
          {view.bugReplies.map((reply) => (
            <TeamsBugReplyCard
              key={reply.fix.bugKey}
              reply={reply}
              locked={writing}
              onUse={(chosen) => {
                setLoadedReply((current) => ({
                  id: (current?.id ?? 0) + 1,
                  html: chosen.replyHtml,
                  mentions: chosen.mentions,
                }))
              }}
            />
          ))}
          <TeamsReplyBox
            ticket={ticket}
            conversationId={view.conversationId}
            rootId={view.thread.isChat ? null : view.thread.rootId}
            people={view.people}
            label={label}
            locked={writing}
            send={send}
            loaded={loadedReply}
          />
        </div>
      ) : null}
      {view.state === 'notPosted' ? (
        <div className="py-2" data-testid="teams-compose-slot">
          <TeamsPostCard ticket={ticket} view={view} label={label} locked={writing} send={send} />
        </div>
      ) : null}
    </div>
  )
}
