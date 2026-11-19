import { Button } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { TeamsReadView } from '@workday/core'
import { useMemo, useState } from 'react'
import { postToChannel } from '../../api/teamsApi.js'
import { t } from '../../i18n.js'
import { TeamsComposer } from './TeamsComposer.js'
import { leadChip } from './teamsComposerDom.js'
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
  const initial = useMemo(
    () => leadChip(renderTeamsHtml(draft.bodyHtml, false), draft.lead),
    [draft.bodyHtml, draft.lead],
  )

  return (
    <div className="flex flex-col gap-2">
      <TeamsComposer
        key={`${String(version)}:${frozen?.key ?? liveKey}`}
        mode="post"
        people={view.people}
        label={label}
        submitLabel={t('teams.post2')}
        withSubject
        initialSubject={draft.subject}
        initialHtml={initial.html}
        initialMentions={initial.mentions}
        locked={locked}
        onChange={() => {
          setFrozen((current) => current ?? { draft: view.draft, key: liveKey })
        }}
        onSend={async (body, subject, confirm) => {
          if (view.posted && !warned) {
            setWarned(true)
            return {
              ok: false,
              message: t('teams.thisTicketWasAlreadyPostedPress'),
              uncertain: false,
            }
          }
          return send(() =>
            postToChannel(ticket, { channelId: view.channelId, subject, draft: body, confirm }),
          )
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onPress={() => {
          setFrozen(null)
          setWarned(false)
          setVersion((current) => current + 1)
          void queryClient.invalidateQueries({ queryKey: ['teams', ticket] })
        }}
      >
        {t('teams.reloadDraft')}
      </Button>
    </div>
  )
}
