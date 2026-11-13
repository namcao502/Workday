import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MeView } from '@workday/core'
import { useLayoutEffect, useState } from 'react'
import { ApiError, queryKeys } from './api/client.js'
import { AccessContext, accessFor, useMe } from './api/useMe.js'
import { useEvents, type SocketFactory } from './api/useEvents.js'
import { useSettings } from './api/useSettings.js'
import { errorText } from './errors.js'
import { setLanguage, t } from './i18n.js'
import { PairPage } from './remote/PairPage.js'
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
      <div className="legacy-page">
        <p className="boot-error">
          {t('Cannot reach the Workday server', 'Không kết nối được tới máy chủ Workday')}
        </p>
      </div>
    ) : null
  }
  setLanguage(settings.data.config.language)
  return <Shell page={page} />
}

function BootError({ error }: { readonly error: unknown }): React.JSX.Element {
  const refusal = error instanceof ApiError ? error.code : null
  return (
    <div className="legacy-page">
      <p className="boot-error">
        {refusal === 'accessRequired' || refusal === 'remoteDisabled'
          ? errorText({ code: refusal })
          : t('Cannot reach the Workday server', 'Không kết nối được tới máy chủ Workday')}
      </p>
    </div>
  )
}

// The pair page and the boot error speak the browser's language: the settings that hold it are not readable yet.
function setBrowserLanguage(): void {
  setLanguage(navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en')
}

// /api/me comes first: an unpaired device must not ask for the settings.
function AppGate({ socketFactory }: AppProps): React.JSX.Element | null {
  const me = useMe()
  if (me.data === undefined) {
    setBrowserLanguage()
    return me.isError ? <BootError error={me.error} /> : null
  }
  if (me.data.mode === 'unpaired') {
    setBrowserLanguage()
    return (
      <div className="legacy-page">
        <PairPage />
      </div>
    )
  }
  return (
    <AccessContext.Provider value={accessFor(me.data)}>
      <AppContent socketFactory={socketFactory} />
    </AccessContext.Provider>
  )
}

const UNPAIRED: MeView = { mode: 'unpaired' }
const MAX_RETRIES = 3

// A refusal from the server will not change on a retry.
function shouldRetry(failures: number, error: Error): boolean {
  const refused = error instanceof ApiError && (error.status === 401 || error.status === 403)
  return !refused && failures < MAX_RETRIES
}

// Any 401 means the device lost its pairing: show the pair page.
function createQueryClient(): QueryClient {
  const handleError = (error: Error): void => {
    if (error instanceof ApiError && error.status === 401) {
      client.setQueryData(queryKeys.me, UNPAIRED)
    }
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: { queries: { retry: shouldRetry } },
  })
  return client
}

interface AppProps {
  readonly socketFactory?: SocketFactory | undefined
}

export function App({ socketFactory }: AppProps): React.JSX.Element {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <AppGate socketFactory={socketFactory} />
    </QueryClientProvider>
  )
}
