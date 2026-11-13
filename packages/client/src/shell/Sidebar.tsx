import { Badge, buttonVariants } from '@heroui/react'
import { t } from '../i18n.js'
import { PageIcon } from './pageIcons.js'
import { PAGE_IDS, pageLabel, type PageId } from './pages.js'

interface NavProps {
  readonly current: PageId
  readonly onSelect: (page: PageId) => void
  readonly attention?: boolean // dot on the Timesheet item
  readonly schedulesDot?: boolean // a scan run ended badly and was not seen yet
  readonly pages?: readonly PageId[]
  readonly workspaceBadge?: number // sessions waiting for the user
  readonly boardBadge?: number // to-dos that need the user now
}

export function Sidebar({
  current,
  onSelect,
  attention = false,
  schedulesDot = false,
  pages = PAGE_IDS,
  workspaceBadge = 0,
  boardBadge = 0,
}: NavProps): React.JSX.Element {
  const mainPages = pages.filter((page) => page !== 'settings')
  return (
    <nav
      className="m-3 flex w-[210px] shrink-0 flex-col rounded-2xl bg-surface p-3 shadow-surface"
      aria-label={t('Pages', 'Trang')}
    >
      <div className="px-3 pb-3 text-base font-semibold">Workday</div>
      <div className="flex flex-col gap-0.5">
        {mainPages.map((page) => (
          <SidebarItem
            key={page}
            page={page}
            current={current}
            onSelect={onSelect}
            attention={
              (page === 'timesheet' && attention) || (page === 'schedules' && schedulesDot)
            }
            workspaceBadge={page === 'workspace' ? workspaceBadge : 0}
            boardBadge={page === 'tickets' ? boardBadge : 0}
          />
        ))}
      </div>
      <div className="mt-auto flex flex-col border-t border-border pt-2">
        <SidebarItem page="settings" current={current} onSelect={onSelect} />
      </div>
    </nav>
  )
}

function SidebarItem({
  page,
  current,
  onSelect,
  attention = false,
  workspaceBadge = 0,
  boardBadge = 0,
}: NavProps & { readonly page: PageId }): React.JSX.Element {
  const count = workspaceBadge + boardBadge
  const selected = page === current
  return (
    <button
      type="button"
      className={`${buttonVariants({ variant: 'ghost' })} w-full justify-start gap-2.5${
        selected ? ' bg-accent-soft text-accent' : ''
      }`}
      aria-current={selected ? 'page' : undefined}
      onClick={() => {
        onSelect(page)
      }}
    >
      <PageIcon page={page} />
      {pageLabel(page)}
      {attention ? (
        <Badge
          className="ml-auto"
          color="danger"
          size="sm"
          data-testid="nav-dot"
          aria-hidden="true"
        />
      ) : null}
      {count === 0 ? null : (
        <Badge
          className="ml-auto"
          color="danger"
          size="sm"
          data-testid="nav-badge"
          aria-hidden="true"
        >
          {count}
        </Badge>
      )}
    </button>
  )
}
