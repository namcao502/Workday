import { Button } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
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
import { t } from '../../i18n.js'
import {
  composeLabel,
  ConversationSelect,
  optionsOf,
  shownConversationId,
  StatePanel,
} from './TeamsPanels.js'
import { TeamsEditBox, TeamsReplyBox } from './TeamsComposeParts.js'
import { TeamsPostCard } from './TeamsPostCard.js'
import { outcomeOf, type SendAction } from './teamsSend.js'
import { TeamsThread } from './TeamsThread.js'
import { useMarkTeamsSeen, useTeamsRead } from './useTeams.js'

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

  async function run(action: () => Promise<TeamsWrite>): Promise<void> {
    setWriting(true)
    setProblem(null)
    try {
      const result = await action()
      if (!result.ok) {
        setProblem(errorText(result.error))
      }
      await queryClient.invalidateQueries({ queryKey: ['teams', ticket] })
    } catch {
      setProblem(t('Could not reach the Workday server', 'Không kết nối được tới Workday server'))
    } finally {
      setWriting(false)
    }
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
        message: t('Could not reach the Workday server', 'Không kết nối được tới Workday server'),
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
          {isError
            ? t('Could not read Teams.', 'Không đọc được Teams.')
            : t('Loading...', 'Đang tải...')}
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
      <div className="flex flex-wrap items-center gap-2 border-b border-separator py-1.5">
        {options.length === 0 ? null : (
          <ConversationSelect options={options} value={id} onChange={setSelected} />
        )}
        {view.state === 'thread' ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              window.open(view.deepLink, '_blank', 'noopener')
            }}
          >
            {t('Open in Teams', 'Mở trong Teams')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            void queryClient.invalidateQueries({ queryKey: ['teams', ticket] })
          }}
        >
          {t('Refresh', 'Làm mới')}
        </Button>
        <span className="min-w-0 flex-1 text-sm text-muted" role="status">
          {problem ?? (isFetching ? t('Reading...', 'Đang đọc...') : '')}
        </span>
      </div>
      <StatePanel
        view={view}
        writing={writing}
        onSignIn={() => {
          void run(teamsSignIn)
        }}
      />
      {view.state === 'thread' ? (
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
            void run(() => handOffMessage(ticket, view.conversationId, message.id, firstSession))
          }}
          onEdit={(message) => {
            setEditingId(message.id)
          }}
          onDelete={(message) => {
            void run(() => deleteMessage(ticket, view.conversationId, message.id))
          }}
        />
      ) : null}
      {view.state === 'thread' ? (
        <div className="border-t border-separator py-2" data-testid="teams-compose-slot">
          <TeamsReplyBox
            ticket={ticket}
            conversationId={view.conversationId}
            rootId={view.thread.isChat ? null : view.thread.rootId}
            people={view.people}
            label={label}
            locked={writing}
            send={send}
          />
        </div>
      ) : null}
      {view.state === 'notPosted' ? (
        <div className="border-t border-separator py-2" data-testid="teams-compose-slot">
          <TeamsPostCard ticket={ticket} view={view} label={label} locked={writing} send={send} />
        </div>
      ) : null}
    </div>
  )
}
