import { Badge, buttonVariants } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'
import { PageIcon } from './pageIcons.js'
import { PAGE_IDS, pageLabel, type PageId } from './pages.js'

interface NavProps {
  readonly current: PageId
  readonly onSelect: (page: PageId) => void
  readonly attention?: boolean // dot on the Timesheet item
  readonly pages?: readonly PageId[]
  readonly workspaceBadge?: number // sessions waiting for the user
  readonly boardBadge?: number // to-dos that need the user now
  readonly settingsBadge?: number // a knowledge scan ended badly and was not seen yet
  readonly collapsed?: boolean // icon rail: labels become tooltips, a badge becomes a dot
}

const PULSE_MS = 1200
const BADGE_CAP = 99

// "99+" past 99, as the WPF row shows it.
export function badgeText(count: number): string {
  return count > BADGE_CAP ? `${String(BADGE_CAP)}+` : String(count)
}

// True for a moment after the count goes up (the WPF row pulses its badge).
function usePulse(count: number): boolean {
  const previous = useRef(count)
  const [pulsing, setPulsing] = useState(false)
  useEffect(() => {
    const rose = count > previous.current
    previous.current = count
    if (!rose) {
      return undefined
    }
    setPulsing(true)
    const timer = setTimeout(() => {
      setPulsing(false)
    }, PULSE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [count])
  return pulsing
}

// What a row's badge counts, one line each, shown in the tooltip while the badge is up.
function badgeTip(page: PageId, workspaceBadge: number, boardBadge: number, settingsBadge: number) {
  if (page === 'workspace' && workspaceBadge !== 0) {
    return [
      t(`${String(workspaceBadge)} session(s) waiting`, `${String(workspaceBadge)} phiên đang chờ`),
    ]
  }
  if (page === 'tickets' && boardBadge !== 0) {
    return [
      t(`${String(boardBadge)} ticket(s) need action`, `${String(boardBadge)} ticket cần xử lý`),
    ]
  }
  if (page === 'settings' && settingsBadge !== 0) {
    return [t('A knowledge scan failed', 'Một lần quét knowledge bị lỗi')]
  }
  return []
}

export function Sidebar({
  current,
  onSelect,
  attention = false,
  pages = PAGE_IDS,
  workspaceBadge = 0,
  boardBadge = 0,
  settingsBadge = 0,
  collapsed = false,
}: NavProps): React.JSX.Element {
  const mainPages = pages.filter((page) => page !== 'settings')
  const item = (page: PageId): React.JSX.Element => (
    <SidebarItem
      key={page}
      page={page}
      current={current}
      onSelect={onSelect}
      attention={page === 'timesheet' && attention}
      workspaceBadge={page === 'workspace' ? workspaceBadge : 0}
      boardBadge={page === 'tickets' ? boardBadge : 0}
      settingsBadge={page === 'settings' ? settingsBadge : 0}
      collapsed={collapsed}
    />
  )
  return (
    <nav
      className={`m-3 mr-0 flex shrink-0 flex-col rounded-2xl bg-surface p-2 shadow-surface ${
        collapsed ? 'w-14' : 'w-[200px]'
      }`}
      aria-label={t('Pages', 'Trang')}
    >
      <div className="flex flex-col">
        {mainPages.map((page, index) => (
          <div key={page} className={index === 0 ? '' : 'mt-0.5'}>
            {item(page)}
          </div>
        ))}
      </div>
      {pages.includes('settings') ? <div className="mt-auto">{item('settings')}</div> : null}
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
  settingsBadge = 0,
  collapsed = false,
}: NavProps & { readonly page: PageId }): React.JSX.Element {
  const count = workspaceBadge + boardBadge + settingsBadge
  const pulsing = usePulse(count)
  const selected = page === current
  const label = pageLabel(page)
  const tip = badgeTip(page, workspaceBadge, boardBadge, settingsBadge)
  const tooltipLines = collapsed ? [label, ...tip] : tip
  const badgeClass = `${collapsed ? 'absolute right-1 top-1' : 'ml-auto'}${
    pulsing ? ' animate-pulse' : ''
  }`
  return (
    <button
      type="button"
      className={`${buttonVariants({ variant: 'ghost' })} relative h-11 w-full gap-3 ${
        collapsed ? 'justify-center' : 'justify-start'
      }${selected ? ' bg-accent-soft text-accent' : ''}`}
      aria-current={selected ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={tooltipLines.length === 0 ? undefined : tooltipLines.join('\n')}
      onClick={() => {
        onSelect(page)
      }}
    >
      <PageIcon page={page} />
      {collapsed ? null : label}
      {attention ? (
        <Badge
          className={badgeClass}
          color="danger"
          size="sm"
          data-testid="nav-dot"
          aria-hidden="true"
        />
      ) : null}
      {count === 0 ? null : (
        <Badge
          className={badgeClass}
          color="danger"
          size="sm"
          data-testid="nav-badge"
          aria-hidden="true"
        >
          {collapsed ? null : badgeText(count)}
        </Badge>
      )}
    </button>
  )
}
