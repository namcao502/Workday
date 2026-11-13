import { REMOTE_AREAS, type AccessLevel, type RemoteArea, type RemoteDevice } from '@workday/core'
import { Button, Input, Switch } from '@heroui/react'
import { useState } from 'react'
import type { RemoteActions } from '../api/useRemote.js'
import { formatShortDate, t, type Language } from '../i18n.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Segmented } from '../ui/Segmented.js'

export type RunRemote = (action: () => Promise<void>) => void

interface RemoteDevicesProps {
  readonly devices: readonly RemoteDevice[]
  readonly actions: RemoteActions
  readonly run: RunRemote
  readonly language: Language
  readonly timeZone: string
}

function areaLabel(area: RemoteArea): string {
  return area === 'board' ? t('Tickets', 'Ticket') : t('Timesheet', 'Bảng công')
}

function levels(): readonly { readonly value: AccessLevel; readonly label: string }[] {
  return [
    { value: 'off', label: t('Off', 'Tắt') },
    { value: 'view', label: t('View', 'Xem') },
    { value: 'act', label: t('Act', 'Thao tác') },
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
      <span title={t('Click to rename', 'Bấm để đổi tên')}>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setDraft(device.name)
            setEditing(true)
          }}
        >
          {device.name}
        </Button>
      </span>
    )
  }
  return (
    <Input
      variant="secondary"
      aria-label={t('Device name', 'Tên thiết bị')}
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
    setPushMessage(
      ok ? t('Test push sent', 'Đã gửi push thử') : t('Test push failed', 'Gửi push thử thất bại'),
    )
  }

  return (
    <li className="flex flex-col gap-2 border-b border-separator py-3">
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
            ? t('Never seen', 'Chưa từng thấy')
            : formatShortDate(new Date(device.lastSeenAt), language, timeZone)}
        </span>
      </div>
      {REMOTE_AREAS.map((area) => (
        <div key={area} className="flex flex-wrap items-center gap-3">
          <span className="w-24 text-sm">{areaLabel(area)}</span>
          <Segmented
            label={t(`${areaLabel(area)} access`, `Quyền ${areaLabel(area)}`)}
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
            {t('Push', 'Push')}
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
          {t('Send test push', 'Gửi push thử')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onPress={() => {
            setConfirming(true)
          }}
        >
          {t('Revoke', 'Thu hồi')}
        </Button>
      </div>
      {pushMessage === null ? null : (
        <p className="text-sm text-muted" role="status">
          {pushMessage}
        </p>
      )}
      {confirming ? (
        <ConfirmDialog
          message={t(
            `Revoke ${device.name}? It must pair again.`,
            `Thu hồi ${device.name}? Thiết bị phải ghép nối lại.`,
          )}
          confirmLabel={t('Revoke', 'Thu hồi')}
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
    return (
      <p className="text-sm text-muted">
        {t('No paired devices yet', 'Chưa có thiết bị nào được ghép nối')}
      </p>
    )
  }
  return (
    <ul className="flex flex-col">
      {props.devices.map((device) => (
        <DeviceRow key={device.id} {...props} device={device} />
      ))}
    </ul>
  )
}
