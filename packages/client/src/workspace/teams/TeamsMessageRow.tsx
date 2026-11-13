import { canReact, isEditable, QUICK_REACTION_KEYS, type TeamsMessage } from '@workday/core'
import { useMemo, useState } from 'react'
import { formatClock, formatShortDate, getLanguage, t } from '../../i18n.js'
import { ConfirmDialog } from '../../timesheet/ConfirmDialog.js'
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
    <article className="teams-message" data-message-id={message.id}>
      <span
        className="teams-avatar"
        style={{ background: nameColor(message.senderName) }}
        aria-hidden="true"
      >
        {message.senderName.slice(0, 1).toUpperCase()}
      </span>
      <div className="teams-message-main">
        <header className="teams-message-head">
          <strong>{message.senderName}</strong>
          <span className="muted">{time}</span>
          {message.editedAt === null ? null : (
            <span className="muted">{t('(edited)', '(đã sửa)')}</span>
          )}
        </header>
        {message.subject === null || message.subject === '' ? null : (
          <h3 className="teams-subject">{message.subject}</h3>
        )}
        <div
          className="teams-content"
          onClick={(event) => {
            const url = fullSizeProxyUrl(event.target)
            if (url !== null) {
              window.open(url, '_blank', 'noopener')
            }
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {message.files.length === 0 ? null : (
          <div className="teams-files">
            {message.files.map((file) => (
              <button
                key={file.url}
                type="button"
                className="wd-button ghost"
                onClick={() => {
                  window.open(file.url, '_blank', 'noopener')
                }}
              >
                {file.fileName}
              </button>
            ))}
          </div>
        )}
        {message.reactions.length === 0 ? null : (
          <div className="teams-reactions">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.key}
                type="button"
                className="teams-chip"
                data-mine={reaction.userMris.some((mri) => sameId(mri, myId))}
                disabled={locked || !canReact(message, reaction.key)}
                onClick={() => {
                  onReact(reaction.key)
                }}
              >
                <TeamsEmoji reaction={reaction.key} />
                <span>{reaction.userMris.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="teams-hover-bar">
        {QUICK_REACTION_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="teams-quick"
            aria-label={t(`React ${key}`, `Phản ứng ${key}`)}
            disabled={locked}
            onClick={() => {
              onReact(key)
            }}
          >
            <TeamsEmoji reaction={key} />
          </button>
        ))}
        <button type="button" className="wd-button ghost" onClick={onAskClaude}>
          {t('Ask Claude', 'Hỏi Claude')}
        </button>
        {own && isEditable(message) ? (
          <button type="button" className="wd-button ghost" onClick={onEdit}>
            {t('Edit', 'Sửa')}
          </button>
        ) : null}
        {own ? (
          <button
            type="button"
            className="wd-button ghost"
            onClick={() => {
              setConfirming(true)
            }}
          >
            {t('Delete', 'Xóa')}
          </button>
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
    </article>
  )
}
