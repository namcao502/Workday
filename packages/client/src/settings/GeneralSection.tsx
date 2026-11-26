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
type OnOff = 'on' | 'off'

export function seasonName(season: Season): string {
  switch (season) {
    case 'spring':
      return t('settings.spring')
    case 'summer':
      return t('settings.summer')
    case 'autumn':
      return t('settings.autumn')
    case 'winter':
      return t('settings.winter')
    case 'christmas':
      return t('settings.christmas')
    case 'tet':
      return t('settings.tet')
    case 'midautumn':
      return t('settings.midAutumn')
    case 'rain':
      return t('settings.rain')
  }
}

export function GeneralSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const { theme, language, season, seasonEffects, seasonCursor, timeZone } = settings.config
  const shown = useActiveSeason(season, timeZone)
  return (
    <Section title={t('settings.general')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-sm text-muted">{t('settings.theme')}</span>
        <Segmented<Theme>
          label={t('settings.theme')}
          value={theme}
          options={[
            { value: 'dark', label: t('settings.dark') },
            { value: 'light', label: t('settings.light') },
          ]}
          onChange={(next) => {
            void save({ theme: next })
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-sm text-muted">{t('settings.season')}</span>
        <Segmented<SeasonSetting>
          label={t('settings.season')}
          value={season}
          options={[
            { value: 'off', label: t('settings.off') },
            { value: 'auto', label: t('settings.byDate') },
            { value: 'shuffle', label: t('settings.shuffle') },
            ...SEASONS.map((value) => ({ value, label: seasonName(value) })),
          ]}
          onChange={(next) => {
            void save({ season: next })
          }}
        />
        {(season === 'auto' || season === 'shuffle') && shown !== null ? (
          <span className="text-sm text-muted" data-testid="season-now">
            {t('settings.now', { shown: seasonName(shown) })}
          </span>
        ) : null}
      </div>
      {season === 'off' ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-24 text-sm text-muted">{t('settings.effects')}</span>
          <Segmented<SeasonEffects>
            label={t('settings.effects')}
            value={seasonEffects}
            options={[
              { value: 'auto', label: t('settings.auto') },
              { value: 'off', label: t('settings.off') },
              { value: 'light', label: t('settings.light2') },
              { value: 'full', label: t('settings.full') },
            ]}
            onChange={(next) => {
              void save({ seasonEffects: next })
            }}
          />
          <span className="text-sm text-muted">{t('settings.autoFullOnAComputerLight')}</span>
        </div>
      )}
      {season === 'off' ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-24 text-sm text-muted">{t('settings.cursor')}</span>
          <Segmented<OnOff>
            label={t('settings.cursor')}
            value={seasonCursor ? 'on' : 'off'}
            options={[
              { value: 'on', label: t('settings.on') },
              { value: 'off', label: t('settings.off') },
            ]}
            onChange={(next) => {
              void save({ seasonCursor: next === 'on' })
            }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-sm text-muted">{t('settings.language')}</span>
        <Segmented<Language>
          label={t('settings.language')}
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
