import { Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { t } from '../i18n.js'
import { useConnectionStatus } from './connection.js'

const SHOW_AFTER_MS = 2000
const LOST_AFTER_MS = 10_000

type Phase = 'hidden' | 'reconnecting' | 'lost'

// Quiet while connected; a pill after 2 s without the socket, a warning after 10 s.
export function ConnectionStatus(): React.JSX.Element | null {
  const status = useConnectionStatus()
  const [phase, setPhase] = useState<Phase>('hidden')

  useEffect(() => {
    if (status !== 'reconnecting') {
      setPhase('hidden')
      return undefined
    }
    const showTimer = setTimeout(() => {
      setPhase('reconnecting')
    }, SHOW_AFTER_MS)
    const lostTimer = setTimeout(() => {
      setPhase('lost')
    }, LOST_AFTER_MS)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(lostTimer)
    }
  }, [status])

  if (phase === 'hidden') {
    return null
  }
  const lost = phase === 'lost'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-full bg-default px-3 py-1 text-xs ${lost ? 'text-danger' : 'text-muted'}`}
    >
      {lost ? null : (
        <span aria-hidden="true">
          <Spinner size="sm" />
        </span>
      )}
      {lost ? t('shell.lostConnection') : t('shell.reconnecting')}
    </div>
  )
}
