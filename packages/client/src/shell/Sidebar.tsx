import { t } from '../i18n.js'
import { PAGE_IDS, pageLabel, type PageId } from './pages.js'

interface NavProps {
  readonly current: PageId
  readonly onSelect: (page: PageId) => void
  readonly attention?: boolean // dot on the Timesheet item
  readonly pages?: readonly PageId[]
  readonly workspaceBadge?: number // sessions waiting for the user
}

export function Sidebar({
  current,
  onSelect,
  attention = false,
  pages = PAGE_IDS,
  workspaceBadge = 0,
}: NavProps): React.JSX.Element {
  const mainPages = pages.filter((page) => page !== 'settings')
  return (
    <nav className="sidebar" aria-label={t('Pages', 'Trang')}>
      <div className="sidebar-title">Workday</div>
      <div className="sidebar-group">
        {mainPages.map((page) => (
          <SidebarItem
            key={page}
            page={page}
            current={current}
            onSelect={onSelect}
            attention={page === 'timesheet' && attention}
            workspaceBadge={page === 'workspace' ? workspaceBadge : 0}
          />
        ))}
      </div>
      <div className="sidebar-bottom">
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
}: NavProps & { readonly page: PageId }): React.JSX.Element {
  return (
    <button
      type="button"
      className="nav-item"
      aria-current={page === current ? 'page' : undefined}
      onClick={() => {
        onSelect(page)
      }}
    >
      {pageLabel(page)}
      {attention ? <span className="nav-dot" aria-hidden="true" /> : null}
      {workspaceBadge === 0 ? null : <span className="nav-badge">{workspaceBadge}</span>}
    </button>
  )
}
