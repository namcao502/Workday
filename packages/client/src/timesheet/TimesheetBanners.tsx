import { Alert, Button } from '@heroui/react'
import type { TimesheetView } from '@workday/core'
import { t } from '../i18n.js'
import { navigateTo } from '../shell/pages.js'

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
          variant="ghost"
          size="sm"
          onPress={() => {
            navigateTo('settings')
          }}
        >
          {t('Open Settings', 'Mở Cài đặt')}
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
        <Banner
          status="warning"
          text={t(
            'Nothing is queued for today - log your work before you leave.',
            'Hôm nay chưa có gì trong hàng đợi - hãy log công việc trước khi nghỉ.',
          )}
        />
      ) : null}
      {kept !== null && kept.kept.length !== 0 ? (
        <Banner
          status="warning"
          withSettings
          text={t(
            `${String(kept.logged)} logged, ${String(kept.kept.length)} kept for retry`,
            `Đã log ${String(kept.logged)}, giữ lại ${String(kept.kept.length)} để thử lại`,
          )}
        />
      ) : null}
      {view.tscConnected ? null : (
        <Banner
          status="danger"
          withSettings
          text={t('TSC is not connected - open Settings', 'Chưa kết nối TSC - mở Cài đặt')}
        />
      )}
      {view.hrmConnected ? null : (
        <Banner
          status="danger"
          withSettings
          text={t('HRM is not connected - open Settings', 'Chưa kết nối HRM - mở Cài đặt')}
        />
      )}
    </>
  )
}
