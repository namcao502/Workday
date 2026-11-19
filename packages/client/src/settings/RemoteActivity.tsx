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
      <h3 className="text-sm font-semibold">{t('settings.activity')}</h3>
      {activity.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.noRemoteChangesYet')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-1 text-left text-xs font-medium uppercase text-muted">
                {t('settings.time')}
              </th>
              <th scope="col" className="py-1 text-left text-xs font-medium uppercase text-muted">
                {t('settings.device')}
              </th>
              <th scope="col" className="py-1 text-left text-xs font-medium uppercase text-muted">
                {t('settings.request')}
              </th>
              <th scope="col" className="py-1 text-left text-xs font-medium uppercase text-muted">
                {t('settings.status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {activity.map((entry) => (
              <tr key={`${entry.at}-${entry.deviceId}-${entry.route}`}>
                <td className="py-1">{formatShortDate(new Date(entry.at), language, timeZone)}</td>
                <td className="py-1">{entry.deviceName}</td>
                <td className="py-1">{`${entry.method} ${entry.route}`}</td>
                <td className={entry.status >= ERROR_STATUS ? 'py-1 text-danger' : 'py-1'}>
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
