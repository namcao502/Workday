import type { TimesheetView } from '@workday/core'
import { t } from '../i18n.js'
import { navigateTo } from '../shell/pages.js'

interface TimesheetBannersProps {
  readonly view: TimesheetView
  readonly reminder: boolean
}

function SettingsButton(): React.JSX.Element {
  return (
    <button
      type="button"
      className="wd-button ghost"
      onClick={() => {
        navigateTo('settings')
      }}
    >
      {t('Open Settings', 'Mở Cài đặt')}
    </button>
  )
}

export function TimesheetBanners({ view, reminder }: TimesheetBannersProps): React.JSX.Element {
  const { lastRun } = view
  const kept =
    lastRun !== null && lastRun.kind === 'drained' && view.queue.length !== 0 ? lastRun : null
  return (
    <>
      {reminder ? (
        <p className="banner">
          {t(
            'Nothing is queued for today - log your work before you leave.',
            'Hôm nay chưa có gì trong hàng đợi - hãy log công việc trước khi nghỉ.',
          )}
        </p>
      ) : null}
      {kept !== null && kept.kept.length !== 0 ? (
        <div className="banner warning-banner">
          <span>
            {t(
              `${String(kept.logged)} logged, ${String(kept.kept.length)} kept for retry`,
              `Đã log ${String(kept.logged)}, giữ lại ${String(kept.kept.length)} để thử lại`,
            )}
          </span>
          <SettingsButton />
        </div>
      ) : null}
      {view.tscConnected ? null : (
        <div className="banner">
          <span>{t('TSC is not connected - open Settings', 'Chưa kết nối TSC - mở Cài đặt')}</span>
          <SettingsButton />
        </div>
      )}
      {view.hrmConnected ? null : (
        <div className="banner">
          <span>{t('HRM is not connected - open Settings', 'Chưa kết nối HRM - mở Cài đặt')}</span>
          <SettingsButton />
        </div>
      )}
    </>
  )
}
