import { guardHtmlLinks } from '../../ui/ctrlLink.js'
import { Button } from '@heroui/react'
import type { BugReply } from '@workday/core'
import { t } from '../../i18n.js'
import { renderTeamsHtml } from './teamsContent.js'

interface TeamsBugReplyCardProps {
  readonly reply: BugReply
  readonly locked: boolean
  readonly onUse: (reply: BugReply) => void
}

// A fixed QC bug still to answer: the prepared reply, loaded into the composer on demand (never sent here).
export function TeamsBugReplyCard({
  reply,
  locked,
  onUse,
}: TeamsBugReplyCardProps): React.JSX.Element {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-2xl bg-surface p-3 shadow-surface"
      data-testid="teams-bug-reply"
    >
      <span className="text-sm font-medium">
        {t(`Answer QC for ${reply.fix.bugKey}`, `Trả lời QC cho ${reply.fix.bugKey}`)}
      </span>
      <div
        className="teams-content max-h-32 overflow-y-auto text-sm"
        onClick={guardHtmlLinks}
        dangerouslySetInnerHTML={{ __html: renderTeamsHtml(reply.replyHtml, false) }}
      />
      <div>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={locked}
          onPress={() => {
            onUse(reply)
          }}
        >
          {t('Use reply', 'Dùng câu trả lời')}
        </Button>
      </div>
    </div>
  )
}
