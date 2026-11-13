import { useSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { AzureDevOpsSection } from './AzureDevOpsSection.js'
import { ConnectionsSection } from './ConnectionsSection.js'
import { GeneralSection } from './GeneralSection.js'
import { NoticesSection } from './NoticesSection.js'
import { RemoteSection } from './RemoteSection.js'
import { TimesheetSection } from './TimesheetSection.js'
import { WorkspaceSection } from './WorkspaceSection.js'

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
          <AzureDevOpsSection settings={settings.data} />
          <NoticesSection settings={settings.data} />
          <TimesheetSection settings={settings.data} />
          <WorkspaceSection settings={settings.data} />
          <RemoteSection settings={settings.data} />
        </>
      )}
    </section>
  )
}
