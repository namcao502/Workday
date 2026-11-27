import { Alert, Button } from '@heroui/react'
import type { TimesheetView } from '@workday/core'
import { t } from '../i18n.js'
import { navigateToSettings } from '../settings/settingsNav.js'

interface TimesheetBannersProps {
  readonly view: TimesheetView
  readonly reminder: boolean
}

interface BannerProps {
  readonly status: 'warning' | 'danger'
  readonly text: string
  readonly withSettings?: boolean
}

function Banner({ status, text, withSettings }: BannerProps): React.JSX.Element {
  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{text}</Alert.Title>
      </Alert.Content>
      {withSettings === true ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={() => {
            navigateToSettings('timesheet')
          }}
        >
          {t('timesheet.openSettings')}
        </Button>
      ) : null}
    </Alert>
  )
}

export function TimesheetBanners({ view, reminder }: TimesheetBannersProps): React.JSX.Element {
  const { lastRun } = view
  const kept =
    lastRun !== null && lastRun.kind === 'drained' && view.queue.length !== 0 ? lastRun : null
  return (
    <>
      {reminder ? (
        <Banner status="warning" text={t('timesheet.nothingIsQueuedForTodayLog')} />
      ) : null}
      {kept !== null && kept.kept.length !== 0 ? (
        <Banner
          status="warning"
          withSettings
          text={t('timesheet.loggedKeptForRetry', {
            logged: String(kept.logged),
            length: String(kept.kept.length),
          })}
        />
      ) : null}
      {view.tscConnected ? null : (
        <Banner status="danger" withSettings text={t('timesheet.tscIsNotConnectedOpenSettings')} />
      )}
      {view.hrmConnected ? null : (
        <Banner status="danger" withSettings text={t('timesheet.hrmIsNotConnectedOpenSettings')} />
      )}
    </>
  )
}
