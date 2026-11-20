import { Badge, buttonVariants } from '@heroui/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'
import { PageIcon } from './pageIcons.js'
import { PAGE_IDS, pageLabel, type PageId } from './pages.js'
import { Tip } from '../ui/Tip.js'

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
    return [t('shell.sessionSWaiting', { workspaceBadge: String(workspaceBadge) })]
  }
  if (page === 'tickets' && boardBadge !== 0) {
    return [t('shell.ticketSNeedAction', { boardBadge: String(boardBadge) })]
  }
  if (page === 'settings' && settingsBadge !== 0) {
    return [t('shell.aKnowledgeScanFailed')]
  }
  return []
}

interface Slot {
  readonly top: number
  readonly height: number
}

// Offset of an element inside the nav, summing offsetTop up the offsetParent chain.
// Measured on screen, so it matches what is drawn whatever the offset parents in between are.
function offsetWithin(nav: HTMLElement, element: HTMLElement): number {
  return element.getBoundingClientRect().top - nav.getBoundingClientRect().top - nav.clientTop
}

// Where the sliding highlight sits: on the active item, re-measured on page change and resize.
function useActiveSlot(
  nav: React.RefObject<HTMLElement | null>,
  current: PageId,
  collapsed: boolean,
): Slot | null {
  const [slot, setSlot] = useState<Slot | null>(null)
  useLayoutEffect(() => {
    const element = nav.current
    if (element === null) {
      return undefined
    }
    function measure(): void {
      const active = element?.querySelector<HTMLElement>('[aria-current="page"]') ?? null
      if (element === null || active === null) {
        setSlot(null)
        return
      }
      const top = offsetWithin(element, active)
      const height = active.offsetHeight
      setSlot((old) => (old?.top === top && old.height === height ? old : { top, height }))
    }
    measure()
    // The first layout can still move while the shell settles, so measure once more after it.
    const frame = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [nav, current, collapsed])
  return slot
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
  const nav = useRef<HTMLElement>(null)
  const slot = useActiveSlot(nav, current, collapsed)
  return (
    <nav
      ref={nav}
      className={`app-sidebar relative m-3 mr-0 flex shrink-0 flex-col rounded-2xl bg-surface p-2 shadow-surface ${
        collapsed ? 'app-sidebar--collapsed w-14' : 'w-[200px]'
      }`}
      aria-label={t('shell.pages')}
    >
      <div
        aria-hidden="true"
        data-testid="nav-indicator"
        className="nav-indicator pointer-events-none absolute inset-x-2 rounded-xl bg-accent-soft"
        style={{
          top: slot?.top ?? 0,
          height: slot?.height ?? 0,
          opacity: slot === null ? 0 : 1,
        }}
      />
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
    <Tip className="block w-full" placement="right" content={tooltipLines.join('\n')}>
      <button
        type="button"
        className={`${buttonVariants({ variant: 'ghost' })} relative h-11 w-full gap-3 ${
          collapsed ? 'justify-center' : 'justify-start'
        }${selected ? ' text-accent' : ''}`}
        aria-current={selected ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        onClick={() => {
          onSelect(page)
        }}
      >
        <PageIcon page={page} />
        {collapsed ? null : <span>{label}</span>}
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
    </Tip>
  )
}
