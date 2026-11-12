import type { PairingView, RemoteConfig } from '@workday/core'
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
      <h3 className="section-subtitle">{t('Pair a device', 'Ghép nối thiết bị')}</h3>
      <div className="button-row">
        <button
          type="button"
          className="button primary"
          disabled={!ready}
          onClick={() => {
            run(actions.openPairing)
          }}
        >
          {t('Pair a device', 'Ghép nối thiết bị')}
        </button>
        {ready ? null : (
          <span className="muted">
            {t(
              'Turn on remote access and save the settings first',
              'Hãy bật truy cập từ xa và lưu cài đặt trước',
            )}
          </span>
        )}
      </div>
      {open ? (
        <div className="pairing">
          <p className="pairing-code" aria-label={t('Pairing code', 'Mã ghép nối')}>
            {pairing.code}
          </p>
          <p className="muted">
            {t('Expires in', 'Hết hạn sau')} {countdown(pairing.expiresAt, now)}
          </p>
          <button
            type="button"
            className="button ghost"
            title={t('Click to copy', 'Bấm để sao chép')}
            onClick={() => {
              void navigator.clipboard.writeText(link)
            }}
          >
            {link}
          </button>
        </div>
      ) : null}
      {pairing.pending === null ? null : (
        <div className="pairing-pending">
          <p>
            {pairing.pending.name}
            {pairing.pending.email === null ? '' : ` - ${pairing.pending.email}`}
            {pairing.pending.ip === null ? '' : ` - ${pairing.pending.ip}`}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button primary"
              onClick={() => {
                run(() => actions.decidePairing('approve'))
              }}
            >
              {t('Approve', 'Chấp nhận')}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                run(() => actions.decidePairing('reject'))
              }}
            >
              {t('Reject', 'Từ chối')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
