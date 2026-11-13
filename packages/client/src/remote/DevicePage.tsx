import { useQueryClient } from '@tanstack/react-query'
import type { AccessLevel, RemoteArea, RemoteDevice } from '@workday/core'
import { useState } from 'react'
import { queryKeys } from '../api/client.js'
import { useMe } from '../api/useMe.js'
import { sendTestPush } from '../api/remoteApi.js'
import { t } from '../i18n.js'
import { pushSupported, subscribePush, unsubscribePush } from './pushSubscription.js'

function areaLabel(area: RemoteArea): string {
  return area === 'board' ? t('Tickets', 'Ticket') : t('Timesheet', 'Bảng công')
}

function levelLabel(level: AccessLevel): string {
  switch (level) {
    case 'off':
      return t('Off', 'Tắt')
    case 'view':
      return t('View', 'Xem')
    case 'act':
      return t('Act', 'Thao tác')
  }
}

const AREAS: readonly RemoteArea[] = ['board', 'timesheet']

async function turnOff(): Promise<null> {
  await unsubscribePush()
  return null
}

function PushSection({ device }: { readonly device: RemoteDevice }): React.JSX.Element {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Runs one push call, then refreshes /api/me so the buttons follow the server.
  async function run(action: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    try {
      setMessage(await action())
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
    } catch {
      setMessage(t('That did not work. Try again.', 'Không thực hiện được. Hãy thử lại.'))
    } finally {
      setBusy(false)
    }
  }

  if (!pushSupported()) {
    return (
      <p className="muted">
        {t(
          'Add Workday to the Home Screen first to get notifications',
          'Hãy thêm Workday vào Màn hình chính trước để nhận thông báo',
        )}
      </p>
    )
  }
  const subscribed = device.hasPushSubscription
  return (
    <div className="device-push">
      {subscribed ? (
        <>
          <button
            type="button"
            className="wd-button secondary"
            disabled={busy}
            onClick={() => void run(turnOff)}
          >
            {t('Turn off', 'Tắt')}
          </button>
          <button
            type="button"
            className="wd-button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                (await sendTestPush())
                  ? t('Test sent', 'Đã gửi thử')
                  : t('The test was not sent', 'Chưa gửi được thông báo thử'),
              )
            }
          >
            {t('Send test', 'Gửi thử')}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="wd-button primary"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              (await subscribePush()) === 'denied'
                ? t('Notifications are blocked in the browser', 'Trình duyệt đang chặn thông báo')
                : null,
            )
          }
        >
          {t('Turn on notifications', 'Bật thông báo')}
        </button>
      )}
      {message === null ? null : <p className="status">{message}</p>}
    </div>
  )
}

// Settings for a paired remote device; everything else in Settings is PC-only.
export function DevicePage(): React.JSX.Element {
  const me = useMe()
  const device = me.data?.mode === 'remote' ? me.data.device : null
  return (
    <section className="page device-page">
      <h1 className="page-title">{t('Settings', 'Cài đặt')}</h1>
      {device === null ? (
        <p className="muted">{t('Loading...', 'Đang tải...')}</p>
      ) : (
        <>
          <dl className="device-facts">
            <dt>{t('Device', 'Thiết bị')}</dt>
            <dd>{device.name}</dd>
            {AREAS.map((area) => (
              <div key={area} className="device-right">
                <dt>{areaLabel(area)}</dt>
                <dd>{levelLabel(device.rights[area])}</dd>
              </div>
            ))}
          </dl>
          <h2 className="section-label">{t('Notifications', 'Thông báo')}</h2>
          <PushSection device={device} />
        </>
      )}
    </section>
  )
}
