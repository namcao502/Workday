import { Button, Chip } from '@heroui/react'
import type { DaySuggestion } from '@workday/core'
import { t } from '../i18n.js'
import { formatMinutes } from './timesheetText.js'

interface DaySuggestionsProps {
  readonly suggestions: readonly DaySuggestion[]
  readonly busy: boolean
  readonly onAdd: (tickets: readonly string[], minutes: readonly number[] | null) => void
}

function detailOf(item: DaySuggestion): string {
  const parts: string[] = []
  if (item.commits !== 0) {
    parts.push(
      item.commits === 1
        ? t('1 commit', '1 commit')
        : t(`${String(item.commits)} commits`, `${String(item.commits)} commit`),
    )
  }
  if (item.claude) {
    parts.push('Claude')
  }
  if (item.shareMinutes !== null) {
    parts.push(formatMinutes(item.shareMinutes))
  }
  return parts.join(' - ')
}

// Tickets the day's git log and Claude sessions show work on; one press queues it, so nothing is typed.
export function DaySuggestions({
  suggestions,
  busy,
  onAdd,
}: DaySuggestionsProps): React.JSX.Element {
  if (suggestions.length === 0) {
    return <></>
  }
  const shares = suggestions.map((item) => item.shareMinutes)
  const allShares = shares.every((share) => share !== null) ? (shares as readonly number[]) : null
  return (
    <section
      className="flex flex-wrap items-center gap-2"
      aria-label={t('Worked on today', 'Đã làm trong ngày')}
    >
      <span className="text-xs font-semibold tracking-wide text-muted">
        {t('WORKED ON', 'ĐÃ LÀM')}
      </span>
      {suggestions.map((item) => (
        <Button
          key={item.ticketKey}
          size="sm"
          variant="secondary"
          isDisabled={busy}
          aria-label={`${item.ticketKey} ${detailOf(item)}`}
          onPress={() => {
            onAdd([item.ticketKey], null)
          }}
        >
          <span className="font-semibold">{item.ticketKey}</span>
          <Chip size="sm" variant="soft">
            {detailOf(item)}
          </Chip>
        </Button>
      ))}
      {suggestions.length > 1 ? (
        <Button
          size="sm"
          variant="ghost"
          isDisabled={busy}
          onPress={() => {
            onAdd(
              suggestions.map((item) => item.ticketKey),
              allShares,
            )
          }}
        >
          {t('Queue all', 'Thêm tất cả')}
        </Button>
      ) : null}
    </section>
  )
}
