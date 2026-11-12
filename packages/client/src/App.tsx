import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLayoutEffect, useState } from 'react'
import { useEvents, type SocketFactory } from './api/useEvents.js'
import { useSettings } from './api/useSettings.js'
import { setLanguage, t } from './i18n.js'
import { pageFromHash, type PageId } from './shell/pages.js'
import { Shell } from './shell/Shell.js'

// Same key as the inline script in index.html.
const THEME_STORAGE_KEY = 'workday.theme'

function useHashPage(): PageId {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash))
  useLayoutEffect(() => {
    function handleHashChange(): void {
      setPage(pageFromHash(window.location.hash))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])
  return page
}

function AppContent({ socketFactory }: AppProps): React.JSX.Element | null {
  useEvents(socketFactory)
  const page = useHashPage()
  const settings = useSettings()
  const theme = settings.data?.config.theme
  const language = settings.data?.config.language

  useLayoutEffect(() => {
    if (theme !== undefined) {
      document.documentElement.dataset['theme'] = theme
      // index.html reads this before the first paint, so a reload does not flash the default theme.
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
    if (language !== undefined) {
      document.documentElement.lang = language
    }
  }, [theme, language])

  if (settings.data === undefined) {
    return settings.isError ? (
      <p className="boot-error">
        {t('Cannot reach the Workday server', 'Không kết nối được tới máy chủ Workday')}
      </p>
    ) : null
  }
  setLanguage(settings.data.config.language)
  return <Shell page={page} />
}

interface AppProps {
  readonly socketFactory?: SocketFactory | undefined
}

export function App({ socketFactory }: AppProps): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent socketFactory={socketFactory} />
    </QueryClientProvider>
  )
}
