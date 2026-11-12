import { t } from '../i18n.js'
import { PAGE_IDS, pageLabel, type PageId } from './pages.js'

interface NavProps {
  readonly current: PageId
  readonly onSelect: (page: PageId) => void
  readonly attention?: boolean // dot on the Timesheet item
}

export function Sidebar({ current, onSelect, attention = false }: NavProps): React.JSX.Element {
  const mainPages = PAGE_IDS.filter((page) => page !== 'settings')
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
    </button>
  )
}
