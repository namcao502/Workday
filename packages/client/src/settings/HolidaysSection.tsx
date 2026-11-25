import { normalizeHolidays, type SettingsView } from '@workday/core'
import { Button, CloseButton, Switch } from '@heroui/react'
import { useState } from 'react'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { DateInput } from '../ui/DateInput.js'
import { Section } from '../ui/Section.js'

// "04-30" -> "30/04 every year"; "2027-02-08" -> "08/02/2027".
export function holidayLabel(entry: string): string {
  const [first, second, third] = entry.split('-')
  return third === undefined
    ? t('settings.yearlyHoliday', { day: `${second ?? ''}/${first ?? ''}` })
    : `${third}/${second ?? ''}/${first ?? ''}`
}

// Public holidays the log reminder and the week treat as days off.
export function HolidaysSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const [holidays, setHolidays] = useState(settings.config.holidays)
  // The picker needs a real date to start from; "sv-SE" formats as YYYY-MM-DD.
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString('sv-SE', { timeZone: settings.config.timeZone }),
  )
  const [yearly, setYearly] = useState(false)
  const [failed, setFailed] = useState(false)

  async function apply(next: readonly string[]): Promise<void> {
    const normalized = normalizeHolidays(next)
    setHolidays(normalized)
    try {
      await save({ holidays: normalized })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  function add(): void {
    void apply([...holidays, yearly ? date.slice(5) : date])
  }

  return (
    <Section title={t('settings.holidays')}>
      <p className="text-sm text-muted">{t('settings.holidaysHint')}</p>
      {holidays.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.noHolidays')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {holidays.map((entry) => (
            <li
              key={entry}
              className="flex items-center gap-1 rounded-full bg-surface-secondary py-1 pl-3 pr-1 text-sm"
            >
              {holidayLabel(entry)}
              <CloseButton
                className="size-6"
                aria-label={t('settings.removeHoliday', { day: holidayLabel(entry) })}
                onPress={() => {
                  void apply(holidays.filter((candidate) => candidate !== entry))
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <DateInput label={t('settings.holidayDate')} name="holiday" value={date} onChange={setDate} />
        <Switch isSelected={yearly} onChange={setYearly}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <span className="text-sm">{t('settings.everyYear')}</span>
          </Switch.Content>
        </Switch>
        <Button variant="secondary" size="sm" onPress={add}>
          {t('settings.addHoliday')}
        </Button>
      </div>
      {failed ? (
        <p className="text-sm text-danger" role="status">
          {t('settings.couldNotSaveTheHolidays')}
        </p>
      ) : null}
    </Section>
  )
}
