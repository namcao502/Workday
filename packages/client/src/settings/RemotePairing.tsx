import type { PairingView, RemoteConfig } from '@workday/core'
import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import type { RemoteActions } from '../api/useRemote.js'
import { t } from '../i18n.js'
import type { RunRemote } from './RemoteDevices.js'

const TICK_MS = 1000
const SECONDS_PER_MINUTE = 60

function useNowMs(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) {
      return undefined
    }
    const timer = setInterval(() => {
      setNow(Date.now())
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [active])
  return now
}

function countdown(expiresAt: string, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / TICK_MS))
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')
  return `${String(Math.floor(seconds / SECONDS_PER_MINUTE))}:${rest}`
}

interface RemotePairingProps {
  readonly pairing: PairingView
  readonly remote: RemoteConfig | null
  readonly actions: RemoteActions
  readonly run: RunRemote
}

export function RemotePairing({
  pairing,
  remote,
  actions,
  run,
}: RemotePairingProps): React.JSX.Element {
  const open = pairing.code !== null && pairing.expiresAt !== null
  const now = useNowMs(open)
  const ready = remote !== null && remote.enabled
  const link = remote === null ? '' : `https://${remote.publicHost}`

  return (
    <>
      <h3 className="text-sm font-semibold">{t('Pair a device', 'Ghép nối thiết bị')}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={!ready}
          onPress={() => {
            run(actions.openPairing)
          }}
        >
          {t('Pair a device', 'Ghép nối thiết bị')}
        </Button>
        {ready ? null : (
          <span className="text-sm text-muted">
            {t(
              'Turn on remote access and save the settings first',
              'Hãy bật truy cập từ xa và lưu cài đặt trước',
            )}
          </span>
        )}
      </div>
      {open ? (
        <div className="flex flex-col items-start gap-2">
          <p
            className="rounded-xl bg-surface-secondary px-4 py-2 font-mono text-2xl tracking-widest"
            aria-label={t('Pairing code', 'Mã ghép nối')}
          >
            {pairing.code}
          </p>
          <p className="text-sm text-muted">
            {t('Expires in', 'Hết hạn sau')} {countdown(pairing.expiresAt, now)}
          </p>
          <span title={t('Click to copy', 'Bấm để sao chép')}>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                void navigator.clipboard.writeText(link)
              }}
            >
              {link}
            </Button>
          </span>
        </div>
      ) : null}
      {pairing.pending === null ? null : (
        <div className="flex flex-col gap-2">
          <p>
            {pairing.pending.name}
            {pairing.pending.email === null ? '' : ` - ${pairing.pending.email}`}
            {pairing.pending.ip === null ? '' : ` - ${pairing.pending.ip}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onPress={() => {
                run(() => actions.decidePairing('approve'))
              }}
            >
              {t('Approve', 'Chấp nhận')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                run(() => actions.decidePairing('reject'))
              }}
            >
              {t('Reject', 'Từ chối')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
