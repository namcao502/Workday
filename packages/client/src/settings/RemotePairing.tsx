import type { PairingView, RemoteConfig, VpnStatusView } from '@workday/core'
import { Button } from '@heroui/react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { RemoteActions } from '../api/useRemote.js'
import { t } from '../i18n.js'
import type { RunRemote } from './RemoteDevices.js'
import { Tip } from '../ui/Tip.js'

const TICK_MS = 1000
const SECONDS_PER_MINUTE = 60
const QR_WIDTH = 180

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

function useQrDataUrl(link: string | null): string | null {
  const [image, setImage] = useState<{ readonly link: string; readonly url: string } | null>(null)
  useEffect(() => {
    if (link === null) {
      return undefined
    }
    let live = true
    QRCode.toDataURL(link, { margin: 1, width: QR_WIDTH }).then(
      (url) => {
        if (live) {
          setImage({ link, url })
        }
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [link])
  return image !== null && image.link === link ? image.url : null
}

interface RemotePairingProps {
  readonly pairing: PairingView
  readonly remote: RemoteConfig | null
  readonly vpn: VpnStatusView
  readonly actions: RemoteActions
  readonly run: RunRemote
}

export function RemotePairing({
  pairing,
  remote,
  vpn,
  actions,
  run,
}: RemotePairingProps): React.JSX.Element {
  const open = pairing.code !== null && pairing.expiresAt !== null
  const now = useNowMs(open)
  const ready = remote !== null && remote.enabled
  const link = remote === null ? '' : `https://${remote.publicHost}`
  const vpnRunning = vpn.server === 'running'
  const setupUrl = vpnRunning ? vpn.setupUrl : null
  const qr = useQrDataUrl(setupUrl)
  const links = [
    ...(vpnRunning && vpn.httpsUrl !== null ? [vpn.httpsUrl] : []),
    ...(ready ? [link] : []),
  ]

  return (
    <>
      <h3 className="text-sm font-semibold">{t('settings.pairADevice')}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={!ready}
          onPress={() => {
            run(actions.openPairing)
          }}
        >
          {t('settings.pairADevice')}
        </Button>
        {ready ? null : (
          <span className="text-sm text-muted">{t('settings.turnOnRemoteAccessAndSave')}</span>
        )}
      </div>
      {setupUrl === null ? null : (
        <div className="flex flex-col items-start gap-2">
          {qr === null ? null : <img src={qr} alt={setupUrl} width={QR_WIDTH} height={QR_WIDTH} />}
          <a className="text-sm underline" href={setupUrl}>
            {setupUrl}
          </a>
        </div>
      )}
      {links.length === 0 ? null : (
        <ul className="text-sm text-muted">
          {links.map((url) => (
            <li key={url}>{url}</li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="flex flex-col items-start gap-2">
          <p
            className="rounded-2xl bg-surface-secondary px-4 py-2 font-mono text-2xl tracking-widest"
            aria-label={t('settings.pairingCode')}
          >
            {pairing.code}
          </p>
          <p className="text-sm text-muted">
            {t('settings.expiresIn')} {countdown(pairing.expiresAt, now)}
          </p>
          <Tip content={t('settings.clickToCopy')}>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                void navigator.clipboard.writeText(link)
              }}
            >
              {link}
            </Button>
          </Tip>
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
              {t('settings.approve')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                run(() => actions.decidePairing('reject'))
              }}
            >
              {t('settings.reject')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
