import { Calendar, DateField, DatePicker, I18nProvider } from '@heroui/react'
import { parseDate } from '@internationalized/date'
import { getLanguage, type Language } from '../i18n.js'

const DATE_LOCALE: Readonly<Record<Language, string>> = { en: 'en-US', vi: 'vi-VN' }

interface DateInputProps {
  readonly label: string // aria label; the field shows no visible one
  readonly name: string
  readonly value: string // YYYY-MM-DD
  readonly onChange: (value: string) => void
  readonly className?: string
}

// HeroUI's date picker (typed segments + a calendar popover) in place of the browser's own, which ignores the theme.
export function DateInput({
  label,
  name,
  value,
  onChange,
  className,
}: DateInputProps): React.JSX.Element {
  const language = getLanguage()
  // Segment order and month names follow the app language: 18/11/2026 in Vietnamese, 11/18/2026 in English.
  return (
    <I18nProvider locale={DATE_LOCALE[language]}>
      <DatePicker
        aria-label={label}
        name={name}
        className={className ?? ''}
        value={parseDate(value)}
        onChange={(next) => {
          if (next !== null) {
            onChange(next.toString())
          }
        }}
      >
        <DateField.Group variant="secondary">
          <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover>
          <Calendar aria-label={label} firstDayOfWeek="mon">
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            {/* "Thứ 2" does not fit a day column; the narrow form is "T2". "Mon" reads better than "M". */}
            <Calendar.Grid weekdayStyle={language === 'vi' ? 'narrow' : 'short'}>
              <Calendar.GridHeader>
                {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  )
}
