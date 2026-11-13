import { Button, Card } from '@heroui/react'
import { canReact, isEditable, QUICK_REACTION_KEYS, type TeamsMessage } from '@workday/core'
import { useMemo, useState } from 'react'
import { formatClock, formatShortDate, getLanguage, t } from '../../i18n.js'
import { ConfirmDialog } from '../../ui/ConfirmDialog.js'
import { fullSizeProxyUrl, nameColor, renderTeamsHtml } from './teamsContent.js'
import { TeamsEmoji } from './TeamsEmoji.js'

export interface TeamsMessageRowProps {
  readonly message: TeamsMessage
  readonly myId: string
  readonly timeZone: string
  readonly locked: boolean // a write is running: the reaction buttons wait for it
  readonly onReact: (key: string) => void
  readonly onAskClaude: () => void
  readonly onEdit: () => void
  readonly onDelete: () => void
}

function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export function TeamsMessageRow({
  message,
  myId,
  timeZone,
  locked,
  onReact,
  onAskClaude,
  onEdit,
  onDelete,
}: TeamsMessageRowProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const html = useMemo(
    () => renderTeamsHtml(message.content, message.isPlainText),
    [message.content, message.isPlainText],
  )
  const own = sameId(message.senderId, myId)
  const sentAt = new Date(message.sentAt)
  const language = getLanguage()
  const time = `${formatShortDate(sentAt, language, timeZone)} ${formatClock(sentAt, language, timeZone)}`

  return (
    <Card className="group relative flex-row gap-2 p-3" data-message-id={message.id}>
      <span
        className="grid size-7 flex-none place-items-center rounded-full font-semibold text-white"
        style={{ background: nameColor(message.senderName) }}
        aria-hidden="true"
      >
        {message.senderName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <header className="flex items-baseline gap-2">
          <strong className="text-sm font-medium">{message.senderName}</strong>
          <span className="text-xs text-muted">{time}</span>
          {message.editedAt === null ? null : (
            <span className="text-xs text-muted">{t('(edited)', '(đã sửa)')}</span>
          )}
        </header>
        {message.subject === null || message.subject === '' ? null : (
          <h3 className="my-0.5 text-sm font-semibold">{message.subject}</h3>
        )}
        <div
          className="teams-content text-sm"
          onClick={(event) => {
            const url = fullSizeProxyUrl(event.target)
            if (url !== null) {
              window.open(url, '_blank', 'noopener')
            }
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {message.files.length === 0 ? null : (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.files.map((file) => (
              <Button
                key={file.url}
                variant="ghost"
                size="sm"
                onPress={() => {
                  window.open(file.url, '_blank', 'noopener')
                }}
              >
                {file.fileName}
              </Button>
            ))}
          </div>
        )}
        {message.reactions.length === 0 ? null : (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <Button
                key={reaction.key}
                variant={
                  reaction.userMris.some((mri) => sameId(mri, myId)) ? 'secondary' : 'outline'
                }
                size="sm"
                className="h-6 min-w-0 gap-1 rounded-full px-2"
                isDisabled={locked || !canReact(message, reaction.key)}
                onPress={() => {
                  onReact(reaction.key)
                }}
              >
                <TeamsEmoji reaction={reaction.key} />
                <span>{reaction.userMris.length}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="absolute -top-2.5 right-1 hidden items-center gap-0.5 rounded-xl border border-separator bg-overlay p-0.5 shadow-overlay group-focus-within:flex group-hover:flex">
        {QUICK_REACTION_KEYS.map((key) => (
          <Button
            key={key}
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={t(`React ${key}`, `Phản ứng ${key}`)}
            isDisabled={locked}
            onPress={() => {
              onReact(key)
            }}
          >
            <TeamsEmoji reaction={key} />
          </Button>
        ))}
        <Button variant="ghost" size="sm" onPress={onAskClaude}>
          {t('Ask Claude', 'Hỏi Claude')}
        </Button>
        {own && isEditable(message) ? (
          <Button variant="ghost" size="sm" onPress={onEdit}>
            {t('Edit', 'Sửa')}
          </Button>
        ) : null}
        {own ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setConfirming(true)
            }}
          >
            {t('Delete', 'Xóa')}
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <ConfirmDialog
          message={t('Delete this message from Teams?', 'Xóa tin nhắn này khỏi Teams?')}
          confirmLabel={t('Delete', 'Xóa')}
          onConfirm={() => {
            setConfirming(false)
            onDelete()
          }}
          onCancel={() => {
            setConfirming(false)
          }}
        />
      ) : null}
    </Card>
  )
}
