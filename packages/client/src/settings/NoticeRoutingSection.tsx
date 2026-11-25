import type { NoticeRouting, SettingsView } from '@workday/core'
import { Description, Label, Switch } from '@heroui/react'
import { useState } from 'react'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { Segmented } from '../ui/Segmented.js'

const IDLE_CHOICES: readonly number[] = [3, 5, 10, 15]
const FALLBACK_CHOICES: readonly number[] = [0, 5, 10, 15]

function minutesLabel(minutes: number): string {
  return minutes === 0 ? t('settings.neverSend') : t('settings.minutesCount', { minutes })
}

// Teams-style routing: the phone waits while the desktop app says the user is at the PC.
export function NoticeRoutingSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const [routing, setRouting] = useState(settings.config.noticeRouting)
  const [failed, setFailed] = useState(false)

  async function apply(change: Partial<NoticeRouting>): Promise<void> {
    const next = { ...routing, ...change }
    setRouting(next)
    try {
      await save({ noticeRouting: next })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <Section title={t('settings.phoneAndPc')}>
      <Switch
        isSelected={routing.phoneOnlyWhenAway}
        onChange={(selected) => {
          void apply({ phoneOnlyWhenAway: selected })
        }}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <div className="flex flex-col">
            <Label>{t('settings.phoneOnlyWhenAway')}</Label>
            <Description>{t('settings.phoneOnlyWhenAwayHint')}</Description>
          </div>
        </Switch.Content>
      </Switch>
      {routing.phoneOnlyWhenAway ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{t('settings.awayAfter')}</span>
            <Segmented<string>
              label={t('settings.awayAfter')}
              value={String(routing.idleMinutes)}
              options={IDLE_CHOICES.map((minutes) => ({
                value: String(minutes),
                label: minutesLabel(minutes),
              }))}
              onChange={(next) => {
                void apply({ idleMinutes: Number(next) })
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{t('settings.sendUnreadAfter')}</span>
            <Segmented<string>
              label={t('settings.sendUnreadAfter')}
              value={String(routing.fallbackMinutes)}
              options={FALLBACK_CHOICES.map((minutes) => ({
                value: String(minutes),
                label: minutesLabel(minutes),
              }))}
              onChange={(next) => {
                void apply({ fallbackMinutes: Number(next) })
              }}
            />
          </div>
        </>
      ) : null}
      {failed ? (
        <p className="text-sm text-danger" role="status">
          {t('settings.couldNotSaveTheNoticeSettings')}
        </p>
      ) : null}
    </Section>
  )
}
