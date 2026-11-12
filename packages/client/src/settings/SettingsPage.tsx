import { useSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { ConnectionsSection } from './ConnectionsSection.js'
import { GeneralSection } from './GeneralSection.js'
import { TimesheetSection } from './TimesheetSection.js'

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  return (
    <section className="page">
      <h1 className="page-title">{t('Settings', 'Cài đặt')}</h1>
      {settings.data === undefined ? (
        <p className="muted">{t('Loading...', 'Đang tải...')}</p>
      ) : (
        <>
          <GeneralSection settings={settings.data} />
          <ConnectionsSection settings={settings.data} />
          <TimesheetSection settings={settings.data} />
        </>
      )}
    </section>
  )
}
