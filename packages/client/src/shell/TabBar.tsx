import { Badge } from '@heroui/react'
import { t } from '../i18n.js'
import { PageIcon } from './pageIcons.js'
import { PAGE_IDS, pageLabel, type PageId } from './pages.js'

interface TabBarProps {
  readonly current: PageId
  readonly onSelect: (page: PageId) => void
  readonly attention?: boolean // dot on the Timesheet item
  readonly pages?: readonly PageId[]
  readonly workspaceBadge?: number // sessions waiting for the user
}

export function TabBar({
  current,
  onSelect,
  attention = false,
  pages = PAGE_IDS,
  workspaceBadge = 0,
}: TabBarProps): React.JSX.Element {
  return (
    <nav
      className="app-tabbar fixed inset-x-2 bottom-2 z-20 flex rounded-2xl bg-surface shadow-surface"
      aria-label={t('shell.tabs')}
    >
      {pages.map((page) => {
        const selected = page === current
        const dot = attention && page === 'timesheet'
        const count = page === 'workspace' ? workspaceBadge : 0
        return (
          <button
            key={page}
            type="button"
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] ${
              selected ? 'text-accent' : 'text-muted hover:text-foreground'
            }`}
            aria-current={selected ? 'page' : undefined}
            onClick={() => {
              onSelect(page)
            }}
          >
            <Badge.Anchor>
              <PageIcon page={page} />
              {dot ? (
                <Badge
                  color="danger"
                  size="sm"
                  placement="top-right"
                  data-testid="nav-dot"
                  aria-hidden="true"
                />
              ) : null}
              {count === 0 ? null : (
                <Badge color="danger" size="sm" placement="top-right" aria-hidden="true">
                  {count}
                </Badge>
              )}
            </Badge.Anchor>
            <span className="max-w-full truncate">{pageLabel(page)}</span>
          </button>
        )
      })}
    </nav>
  )
}
