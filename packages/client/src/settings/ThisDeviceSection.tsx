import { Button } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { RemoteDevice } from '@workday/core'
import { useState } from 'react'
import { queryKeys } from '../api/client.js'
import { useMe } from '../api/useMe.js'
import { sendTestPush } from '../api/remoteApi.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { pushSupported, subscribePush, unsubscribePush } from '../remote/pushSubscription.js'

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
      setMessage(t('remote.thatDidNotWorkTryAgain'))
    } finally {
      setBusy(false)
    }
  }

  if (!pushSupported()) {
    return <p className="text-sm text-muted">{t('remote.addWorkdayToTheHomeScreen')}</p>
  }
  const subscribed = device.hasPushSubscription
  return (
    <div className="flex flex-wrap items-center gap-2">
      {subscribed ? (
        <>
          <Button variant="secondary" size="sm" isDisabled={busy} onPress={() => void run(turnOff)}>
            {t('remote.turnOff')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            isDisabled={busy}
            onPress={() =>
              void run(async () =>
                (await sendTestPush()) ? t('remote.testSent') : t('remote.theTestWasNotSent'),
              )
            }
          >
            {t('remote.sendTest')}
          </Button>
        </>
      ) : (
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy}
          onPress={() =>
            void run(async () =>
              (await subscribePush()) === 'denied'
                ? t('remote.notificationsAreBlockedInTheBrowser')
                : null,
            )
          }
        >
          {t('remote.turnOnNotifications')}
        </Button>
      )}
      {message === null ? null : <p className="text-sm text-muted">{message}</p>}
    </div>
  )
}

// This device's own card in Settings; shown on a paired remote device only.
export function ThisDeviceSection(): React.JSX.Element {
  const me = useMe()
  const device = me.data?.mode === 'remote' ? me.data.device : null
  return (
    <Section title={t('remote.device')}>
      {device === null ? (
        <p className="text-sm text-muted">{t('remote.loading')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">{t('remote.device')}</dt>
            <dd>{device.name}</dd>
          </dl>
          <p className="text-sm text-muted">{t('remote.notifications')}</p>
          <PushSection device={device} />
        </div>
      )}
    </Section>
  )
}
