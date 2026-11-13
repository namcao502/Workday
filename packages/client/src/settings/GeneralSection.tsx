import type { SettingsView } from '@workday/core'
import { useSaveSettings } from '../api/useSettings.js'
import { t, type Language } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { Segmented } from '../ui/Segmented.js'

type Theme = SettingsView['config']['theme']

export function GeneralSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const { theme, language } = settings.config
  return (
    <Section title={t('General', 'Chung')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-sm text-muted">{t('Theme', 'Giao diện')}</span>
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
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-sm text-muted">{t('Language', 'Ngôn ngữ')}</span>
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
    </Section>
  )
}
