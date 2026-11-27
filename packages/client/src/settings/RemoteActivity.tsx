import type { ActivityEntry } from '@workday/core'
import { formatShortDate, t, type Language } from '../i18n.js'
import { useNarrow } from '../shell/useNarrow.js'

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
  const narrow = useNarrow()
  const statusClass = (entry: ActivityEntry): string =>
    entry.status >= ERROR_STATUS ? 'text-danger' : 'text-muted'
  return (
    <>
      <h3 className="text-sm font-semibold">{t('settings.activity')}</h3>
      {activity.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.noRemoteChangesYet')}</p>
      ) : narrow ? (
        // A phone has no room for four columns: each entry is two lines, the long route wrapping anywhere.
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm" data-testid="remote-activity">
          {activity.map((entry) => (
            <li
              key={`${entry.at}-${entry.deviceId}-${entry.route}`}
              className="flex min-w-0 flex-col gap-0.5"
            >
              <span className="flex min-w-0 items-start gap-2">
                <span className="min-w-0 flex-1 font-mono text-xs wrap-anywhere">
                  {`${entry.method} ${entry.route}`}
                </span>
                <span className={`flex-none text-xs ${statusClass(entry)}`}>{entry.status}</span>
              </span>
              <span className="text-xs text-muted">
                {`${formatShortDate(new Date(entry.at), language, timeZone)} · ${entry.deviceName}`}
              </span>
            </li>
          ))}
        </ul>
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
                <td className="py-1 wrap-anywhere">{`${entry.method} ${entry.route}`}</td>
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
