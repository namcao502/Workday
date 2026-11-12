import type { ActivityEntry } from '@workday/core'
import { formatShortDate, t, type Language } from '../i18n.js'

const ERROR_STATUS = 400

interface RemoteActivityProps {
  readonly activity: readonly ActivityEntry[]
  readonly language: Language
  readonly timeZone: string
}

export function RemoteActivity({
  activity,
  language,
  timeZone,
}: RemoteActivityProps): React.JSX.Element {
  return (
    <>
      <h3 className="section-subtitle">{t('Activity', 'Nhật ký hoạt động')}</h3>
      {activity.length === 0 ? (
        <p className="muted">{t('No remote changes yet', 'Chưa có thao tác từ xa')}</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th scope="col">{t('Time', 'Giờ')}</th>
              <th scope="col">{t('Device', 'Thiết bị')}</th>
              <th scope="col">{t('Request', 'Yêu cầu')}</th>
              <th scope="col">{t('Status', 'Trạng thái')}</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((entry) => (
              <tr key={`${entry.at}-${entry.deviceId}-${entry.route}`}>
                <td>{formatShortDate(new Date(entry.at), language, timeZone)}</td>
                <td>{entry.deviceName}</td>
                <td>{`${entry.method} ${entry.route}`}</td>
                <td className={entry.status >= ERROR_STATUS ? 'danger' : undefined}>
                  {entry.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
