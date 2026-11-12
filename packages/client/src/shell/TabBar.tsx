import { t } from '../i18n.js'
import { PAGE_IDS, pageLabel, type PageId } from './pages.js'

interface TabBarProps {
  readonly current: PageId
  readonly onSelect: (page: PageId) => void
  readonly attention?: boolean // dot on the Timesheet item
  readonly pages?: readonly PageId[]
}

export function TabBar({
  current,
  onSelect,
  attention = false,
  pages = PAGE_IDS,
}: TabBarProps): React.JSX.Element {
  return (
    <nav className="tab-bar" aria-label={t('Tabs', 'Thẻ')}>
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          className="tab-item"
          aria-current={page === current ? 'page' : undefined}
          onClick={() => {
            onSelect(page)
          }}
        >
          {pageLabel(page)}
          {attention && page === 'timesheet' ? (
            <span className="nav-dot" aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </nav>
  )
}
