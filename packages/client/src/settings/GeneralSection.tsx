import {
  SEASONS,
  type Season,
  type SeasonEffects,
  type SeasonSetting,
  type SettingsView,
} from '@workday/core'
import { useSaveSettings } from '../api/useSettings.js'
import { t, type Language } from '../i18n.js'
import { useActiveSeason } from '../season/useActiveSeason.js'
import { Section } from '../ui/Section.js'
import { Segmented } from '../ui/Segmented.js'

type Theme = SettingsView['config']['theme']

export function seasonName(season: Season): string {
  switch (season) {
    case 'spring':
      return t('Spring', 'Xuân')
    case 'summer':
      return t('Summer', 'Hạ')
    case 'autumn':
      return t('Autumn', 'Thu')
    case 'winter':
      return t('Winter', 'Đông')
    case 'christmas':
      return t('Christmas', 'Giáng sinh')
    case 'tet':
      return t('Tet', 'Tết')
    case 'midautumn':
      return t('Mid-Autumn', 'Trung thu')
    case 'rain':
      return t('Rain', 'Mưa')
  }
}

export function GeneralSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const { theme, language, season, seasonEffects, timeZone } = settings.config
  const shown = useActiveSeason(season, timeZone)
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
        <span className="w-24 text-sm text-muted">{t('Season', 'Theo mùa')}</span>
        <Segmented<SeasonSetting>
          label={t('Season', 'Theo mùa')}
          value={season}
          options={[
            { value: 'off', label: t('Off', 'Tắt') },
            { value: 'auto', label: t('By date', 'Theo ngày') },
            ...SEASONS.map((value) => ({ value, label: seasonName(value) })),
          ]}
          onChange={(next) => {
            void save({ season: next })
          }}
        />
        {season === 'auto' && shown !== null ? (
          <span className="text-sm text-muted" data-testid="season-now">
            {t(`Now: ${seasonName(shown)}`, `Hiện tại: ${seasonName(shown)}`)}
          </span>
        ) : null}
      </div>
      {season === 'off' ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-24 text-sm text-muted">{t('Effects', 'Hiệu ứng')}</span>
          <Segmented<SeasonEffects>
            label={t('Effects', 'Hiệu ứng')}
            value={seasonEffects}
            options={[
              { value: 'auto', label: t('Auto', 'Tự động') },
              { value: 'off', label: t('Off', 'Tắt') },
              { value: 'light', label: t('Light', 'Nhẹ') },
              { value: 'full', label: t('Full', 'Đầy đủ') },
            ]}
            onChange={(next) => {
              void save({ seasonEffects: next })
            }}
          />
          <span className="text-sm text-muted">
            {t(
              'Auto: full on a computer, light on a phone. Off keeps the colors.',
              'Tự động: đầy đủ trên máy tính, nhẹ trên điện thoại. Tắt vẫn giữ màu.',
            )}
          </span>
        </div>
      )}
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
