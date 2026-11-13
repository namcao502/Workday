import { useQueryClient } from '@tanstack/react-query'
import type { TeamsReadView } from '@workday/core'
import { useState } from 'react'
import { postToChannel } from '../../api/teamsApi.js'
import { t } from '../../i18n.js'
import { TeamsComposer } from './TeamsComposer.js'
import { renderTeamsHtml } from './teamsContent.js'
import type { SendAction } from './teamsSend.js'

type NotPostedView = Extract<TeamsReadView, { state: 'notPosted' }>
type Draft = NotPostedView['draft']

interface TeamsPostCardProps {
  readonly ticket: string
  readonly view: NotPostedView
  readonly label: string
  readonly locked: boolean
  readonly send: SendAction
}

interface Frozen {
  readonly draft: Draft
  readonly key: string
}

const draftKey = (draft: Draft): string => `${draft.subject}\n${draft.bodyHtml}`

// The ticket's first post. It follows the server's draft until the user types, then keeps their text.
export function TeamsPostCard({
  ticket,
  view,
  label,
  locked,
  send,
}: TeamsPostCardProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [frozen, setFrozen] = useState<Frozen | null>(null)
  const [version, setVersion] = useState(0)
  const [warned, setWarned] = useState(false)
  const draft = frozen?.draft ?? view.draft
  const liveKey = draftKey(view.draft)

  return (
    <div className="teams-post-card">
      <TeamsComposer
        key={`${String(version)}:${frozen?.key ?? liveKey}`}
        mode="post"
        people={[]}
        label={label}
        submitLabel={t('Post', 'Đăng')}
        withSubject
        initialSubject={draft.subject}
        initialHtml={renderTeamsHtml(draft.bodyHtml, false)}
        locked={locked}
        onChange={() => {
          setFrozen((current) => current ?? { draft: view.draft, key: liveKey })
        }}
        onSend={async (body, subject, confirm) => {
          if (view.posted && !warned) {
            setWarned(true)
            return {
              ok: false,
              message: t(
                'This ticket was already posted. Press Post again to post anyway.',
                'Ticket này đã được đăng. Bấm Đăng lần nữa để vẫn đăng.',
              ),
              uncertain: false,
            }
          }
          return send(() =>
            postToChannel(ticket, { channelId: view.channelId, subject, draft: body, confirm }),
          )
        }}
      />
      <button
        type="button"
        className="wd-button ghost"
        onClick={() => {
          setFrozen(null)
          setWarned(false)
          setVersion((current) => current + 1)
          void queryClient.invalidateQueries({ queryKey: ['teams', ticket] })
        }}
      >
        {t('Reload draft', 'Nạp lại bản nháp')}
      </button>
    </div>
  )
}
