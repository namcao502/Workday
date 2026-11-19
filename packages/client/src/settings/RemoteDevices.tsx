import { REMOTE_AREAS, type AccessLevel, type RemoteArea, type RemoteDevice } from '@workday/core'
import { Button, Input, Switch } from '@heroui/react'
import { useState } from 'react'
import type { RemoteActions } from '../api/useRemote.js'
import { formatShortDate, t, type Language } from '../i18n.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Segmented } from '../ui/Segmented.js'
import { Tip } from '../ui/Tip.js'

export type RunRemote = (action: () => Promise<void>) => void

interface RemoteDevicesProps {
  readonly devices: readonly RemoteDevice[]
  readonly actions: RemoteActions
  readonly run: RunRemote
  readonly language: Language
  readonly timeZone: string
}

function areaLabel(area: RemoteArea): string {
  return area === 'board' ? t('settings.tickets') : t('settings.timesheet')
}

function levels(): readonly { readonly value: AccessLevel; readonly label: string }[] {
  return [
    { value: 'off', label: t('settings.off') },
    { value: 'view', label: t('settings.view') },
    { value: 'act', label: t('settings.act') },
  ]
}

function DeviceName({
  device,
  onRename,
}: {
  readonly device: RemoteDevice
  readonly onRename: (name: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(device.name)

  if (!editing) {
    return (
      <Tip content={t('settings.clickToRename')}>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => {
            setDraft(device.name)
            setEditing(true)
          }}
        >
          {device.name}
        </Button>
      </Tip>
    )
  }
  return (
    <Input
      variant="secondary"
      aria-label={t('settings.deviceName')}
      value={draft}
      autoFocus
      onChange={(event) => {
        setDraft(event.target.value)
      }}
      onBlur={() => {
        setEditing(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setEditing(false)
        } else if (event.key === 'Enter') {
          const name = draft.trim()
          setEditing(false)
          if (name !== '' && name !== device.name) {
            onRename(name)
          }
        }
      }}
    />
  )
}

function DeviceRow({
  device,
  actions,
  run,
  language,
  timeZone,
}: RemoteDevicesProps & { readonly device: RemoteDevice }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [pushMessage, setPushMessage] = useState<string | null>(null)

  async function testPush(): Promise<void> {
    const ok = await actions.sendTestPush(device.id)
    setPushMessage(ok ? t('settings.testPushSent') : t('settings.testPushFailed'))
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-surface-secondary p-3">
      <div className="flex flex-wrap items-center gap-2">
        <DeviceName
          device={device}
          onRename={(name) => {
            run(() => actions.updateDevice(device.id, { name }))
          }}
        />
        <span className="text-sm text-muted">{device.email ?? ''}</span>
        <span className="text-sm text-muted">
          {device.lastSeenAt === null
            ? t('settings.neverSeen')
            : formatShortDate(new Date(device.lastSeenAt), language, timeZone)}
        </span>
      </div>
      {REMOTE_AREAS.map((area) => (
        <div key={area} className="flex flex-wrap items-center gap-3">
          <span className="w-24 text-sm">{areaLabel(area)}</span>
          <Segmented
            label={t('settings.access', { area: areaLabel(area) })}
            value={device.rights[area]}
            options={levels()}
            onChange={(level) => {
              run(() =>
                actions.updateDevice(device.id, { rights: { ...device.rights, [area]: level } }),
              )
            }}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          isSelected={device.pushEnabled}
          isDisabled={!device.hasPushSubscription}
          onChange={(selected) => {
            run(() => actions.updateDevice(device.id, { pushEnabled: selected }))
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            {t('settings.push')}
          </Switch.Content>
        </Switch>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={!device.hasPushSubscription}
          onPress={() => {
            run(testPush)
          }}
        >
          {t('settings.sendTestPush')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onPress={() => {
            setConfirming(true)
          }}
        >
          {t('settings.revoke')}
        </Button>
      </div>
      {pushMessage === null ? null : (
        <p className="text-sm text-muted" role="status">
          {pushMessage}
        </p>
      )}
      {confirming ? (
        <ConfirmDialog
          message={t('settings.revokeItMustPairAgain', { name: device.name })}
          confirmLabel={t('settings.revoke')}
          onConfirm={() => {
            setConfirming(false)
            run(() => actions.revokeDevice(device.id))
          }}
          onCancel={() => {
            setConfirming(false)
          }}
        />
      ) : null}
    </li>
  )
}

export function RemoteDevices(props: RemoteDevicesProps): React.JSX.Element {
  if (props.devices.length === 0) {
    return <p className="text-sm text-muted">{t('settings.noPairedDevicesYet')}</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {props.devices.map((device) => (
        <DeviceRow key={device.id} {...props} device={device} />
      ))}
    </ul>
  )
}
