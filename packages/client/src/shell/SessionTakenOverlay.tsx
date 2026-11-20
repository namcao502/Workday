import { Button } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { t } from '../i18n.js'
import { setSession, type SessionState } from './session.js'

// Full page, no content behind it: nothing mounted means no more queries.
export function SessionTakenOverlay({
  state,
}: {
  readonly state: Exclude<SessionState, 'ok'>
}): React.JSX.Element {
  const queryClient = useQueryClient()
  useEffect(() => {
    void queryClient.cancelQueries()
  }, [queryClient])
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-base">
          {state === 'takenByApp' ? t('app.sessionInDesktopApp') : t('app.sessionInAnotherTab')}
        </p>
        {state === 'takenByTab' ? (
          <Button
            variant="primary"
            onPress={() => {
              setSession('ok')
            }}
          >
            {t('app.useHere')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
