import { BoardPage } from '../board/BoardPage.js'
import { SettingsPage } from '../settings/SettingsPage.js'
import { t } from '../i18n.js'
import { Sidebar } from './Sidebar.js'
import { TabBar } from './TabBar.js'
import { navigateTo, pageLabel, type PageId } from './pages.js'
import { useNarrow } from './useNarrow.js'

interface ShellProps {
  readonly page: PageId
}

function PageContent({ page }: ShellProps): React.JSX.Element {
  if (page === 'settings') {
    return <SettingsPage />
  }
  if (page === 'tickets') {
    return <BoardPage />
  }
  return (
    <section className="page">
      <h1 className="page-title">{pageLabel(page)}</h1>
      <p className="muted">{t('Coming soon', 'Sắp ra mắt')}</p>
    </section>
  )
}

export function Shell({ page }: ShellProps): React.JSX.Element {
  const narrow = useNarrow()
  return (
    <div className={narrow ? 'shell shell-narrow' : 'shell'}>
      {narrow ? null : <Sidebar current={page} onSelect={navigateTo} />}
      <main className="shell-content">
        <PageContent page={page} />
      </main>
      {narrow ? <TabBar current={page} onSelect={navigateTo} /> : null}
    </div>
  )
}
