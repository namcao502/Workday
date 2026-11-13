import type { TeamsMessage, TeamsPerson } from '@workday/core'
import { editMessage, replyToThread } from '../../api/teamsApi.js'
import { t } from '../../i18n.js'
import { TeamsComposer } from './TeamsComposer.js'
import { loadMessage } from './teamsComposerDom.js'
import type { SendAction } from './teamsSend.js'

interface ReplyBoxProps {
  readonly ticket: string
  readonly conversationId: string
  readonly rootId: string | null
  readonly people: readonly TeamsPerson[]
  readonly label: string
  readonly locked: boolean
  readonly send: SendAction
}

export function TeamsReplyBox({
  ticket,
  conversationId,
  rootId,
  people,
  label,
  locked,
  send,
}: ReplyBoxProps): React.JSX.Element {
  return (
    <TeamsComposer
      key={conversationId}
      mode="reply"
      people={people}
      label={label}
      submitLabel={t('Send', 'Gửi')}
      locked={locked}
      onSend={(draft, _subject, confirm) =>
        send(() => replyToThread(ticket, { conversationId, rootId, draft, confirm }))
      }
    />
  )
}

interface EditBoxProps {
  readonly ticket: string
  readonly conversationId: string
  readonly message: TeamsMessage
  readonly isRoot: boolean // the root of a channel post also has a subject
  readonly people: readonly TeamsPerson[]
  readonly locked: boolean
  readonly send: SendAction
  readonly onClose: () => void
}

// A message of mine turned into a composer in place.
export function TeamsEditBox({
  ticket,
  conversationId,
  message,
  isRoot,
  people,
  locked,
  send,
  onClose,
}: EditBoxProps): React.JSX.Element {
  const loaded = loadMessage(message)
  return (
    <TeamsComposer
      mode="edit"
      people={people}
      label={t('Edit message', 'Sửa tin nhắn')}
      submitLabel={t('Save', 'Lưu')}
      initialHtml={loaded.html}
      initialMentions={loaded.mentions}
      withSubject={isRoot}
      initialSubject={message.subject ?? ''}
      locked={locked}
      onCancel={onClose}
      onSend={async (draft, subject) => {
        const outcome = await send(() =>
          editMessage(ticket, {
            conversationId,
            messageId: message.id,
            subject: isRoot ? subject : null,
            draft,
          }),
        )
        if (outcome.ok) {
          onClose()
        }
        return outcome
      }}
    />
  )
}
