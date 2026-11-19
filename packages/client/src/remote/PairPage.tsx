import { Button, Input, Label, TextField } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { getPairingStatus, submitPairing } from '../api/remoteApi.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'

const CODE_LENGTH = 6
const DEFAULT_POLL_MS = 2000
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export function guessDeviceName(userAgent: string): string {
  if (userAgent.includes('iPhone')) {
    return 'iPhone'
  }
  if (userAgent.includes('iPad')) {
    return 'iPad'
  }
  return userAgent.includes('Android') ? 'Android' : 'Phone'
}

type Phase =
  | { readonly kind: 'form'; readonly notice: string | null }
  | { readonly kind: 'waiting'; readonly requestId: string }

interface PairPageProps {
  readonly onApproved?: () => void
  readonly pollMs?: number
  readonly timeoutMs?: number
}

function reloadPage(): void {
  window.location.reload()
}

// Polls the pairing status until it is decided or the window closes.
function useWaiting(
  requestId: string,
  { onApproved, pollMs, timeoutMs }: Required<PairPageProps>,
  onFailed: (notice: string) => void,
): void {
  useEffect(() => {
    let stopped = false
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= timeoutMs) {
        stopped = true
        clearInterval(timer)
        onFailed(t('remote.thePairingWindowClosedTryAgain'))
        return
      }
      getPairingStatus(requestId)
        .then((status) => {
          if (stopped || status === 'waiting') {
            return
          }
          stopped = true
          clearInterval(timer)
          if (status === 'approved') {
            onApproved()
          } else {
            onFailed(t('remote.thePcRejectedThisDevice'))
          }
        })
        .catch(() => undefined)
    }, pollMs)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [requestId, onApproved, pollMs, timeoutMs, onFailed])
}

function WaitingView(props: {
  readonly requestId: string
  readonly options: Required<PairPageProps>
  readonly onFailed: (notice: string) => void
}): React.JSX.Element {
  useWaiting(props.requestId, props.options, props.onFailed)
  return <p className="text-sm text-muted">{t('remote.waitingForApprovalOnThePc')}</p>
}

export function PairPage({
  onApproved = reloadPage,
  pollMs = DEFAULT_POLL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: PairPageProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'form', notice: null })
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => guessDeviceName(navigator.userAgent))
  const [sending, setSending] = useState(false)
  const showNotice = useCallback((notice: string) => {
    setPhase({ kind: 'form', notice })
  }, [])

  async function pair(): Promise<void> {
    setSending(true)
    try {
      const result = await submitPairing(code, name.trim())
      setPhase(
        result.ok
          ? { kind: 'waiting', requestId: result.requestId }
          : { kind: 'form', notice: errorText(result.error) },
      )
    } catch {
      setPhase({
        kind: 'form',
        notice: t('remote.cannotReachTheWorkdayServer'),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('remote.pairThisDevice')}</h1>
      {phase.kind === 'waiting' ? (
        <WaitingView
          requestId={phase.requestId}
          options={{ onApproved, pollMs, timeoutMs }}
          onFailed={showNotice}
        />
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void pair()
          }}
        >
          <p className="text-sm text-muted">{t('remote.enterTheCodeShownOnThe')}</p>
          <TextField
            fullWidth
            value={code}
            onChange={(value) => {
              setCode(value.replace(/\s+/g, '').toUpperCase())
            }}
          >
            <Label>{t('remote.code')}</Label>
            <Input
              variant="secondary"
              maxLength={CODE_LENGTH}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </TextField>
          <TextField fullWidth value={name} onChange={setName}>
            <Label>{t('remote.deviceName')}</Label>
            <Input variant="secondary" />
          </TextField>
          {phase.notice === null ? null : <p className="text-sm text-danger">{phase.notice}</p>}
          <Button
            type="submit"
            variant="primary"
            isDisabled={sending || code.length !== CODE_LENGTH || name.trim() === ''}
          >
            {t('remote.pair')}
          </Button>
        </form>
      )}
    </main>
  )
}
