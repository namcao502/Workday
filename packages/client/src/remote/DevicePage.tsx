import { Button } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { AccessLevel, RemoteArea, RemoteDevice } from '@workday/core'
import { Fragment, useState } from 'react'
import { queryKeys } from '../api/client.js'
import { useMe } from '../api/useMe.js'
import { sendTestPush } from '../api/remoteApi.js'
import { t } from '../i18n.js'
import { Page } from '../ui/Page.js'
import { Section } from '../ui/Section.js'
import { pushSupported, subscribePush, unsubscribePush } from './pushSubscription.js'

function areaLabel(area: RemoteArea): string {
  return area === 'board' ? t('remote.tickets') : t('remote.timesheet')
}

function levelLabel(level: AccessLevel): string {
  switch (level) {
    case 'off':
      return t('remote.off')
    case 'view':
      return t('remote.view')
    case 'act':
      return t('remote.act')
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

// Settings for a paired remote device; everything else in Settings is PC-only.
export function DevicePage(): React.JSX.Element {
  const me = useMe()
  const device = me.data?.mode === 'remote' ? me.data.device : null
  return (
    <Page title={t('remote.settings')}>
      {device === null ? (
        <p className="text-sm text-muted">{t('remote.loading')}</p>
      ) : (
        <>
          <Section title={t('remote.device')}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted">{t('remote.device')}</dt>
              <dd>{device.name}</dd>
              {AREAS.map((area) => (
                <Fragment key={area}>
                  <dt className="text-muted">{areaLabel(area)}</dt>
                  <dd>{levelLabel(device.rights[area])}</dd>
                </Fragment>
              ))}
            </dl>
          </Section>
          <Section title={t('remote.notifications')}>
            <PushSection device={device} />
          </Section>
        </>
      )}
    </Page>
  )
}
