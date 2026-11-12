import type { SettingsView } from '@workday/core'
import { useSaveSettings } from '../api/useSettings.js'
import { t, type Language } from '../i18n.js'
import { Segmented } from './Segmented.js'

type Theme = SettingsView['config']['theme']

export function GeneralSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const { theme, language } = settings.config
  return (
    <section className="section">
      <h2 className="section-title">{t('General', 'Chung')}</h2>
      <div className="field-row">
        <span className="field-label">{t('Theme', 'Giao diện')}</span>
        <Segmented<Theme>
          label={t('Theme', 'Giao diện')}
          value={theme}
          options={[
            { value: 'dark', label: t('Dark', 'Tối') },
            { value: 'light', label: t('Light', 'Sáng') },
          ]}
          onChange={(next) => {
            void save({ theme: next })
          }}
        />
      </div>
      <div className="field-row">
        <span className="field-label">{t('Language', 'Ngôn ngữ')}</span>
        <Segmented<Language>
          label={t('Language', 'Ngôn ngữ')}
          value={language}
          options={[
            { value: 'en', label: 'English' },
            { value: 'vi', label: 'Tiếng Việt' },
          ]}
          onChange={(next) => {
            void save({ language: next })
          }}
        />
      </div>
    </section>
  )
}
