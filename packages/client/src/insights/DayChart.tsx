import { Card } from '@heroui/react'
import { t } from '../i18n.js'
import { Tip } from '../ui/Tip.js'
import { dayLabel, formatHours, formatTokens } from './insightsText.js'

export interface DayValue {
  readonly day: string // "YYYY-MM-DD"
  readonly hours: number | null // null = HRM was not read
  readonly tokens: number
}

interface DayChartProps {
  readonly days: readonly DayValue[]
}

// Past this many days the labels shrink to the day of the month and the values live only in the tooltips.
const FULL_LABEL_DAYS = 10
const PLOT_PX = 96
const EMPTY_PX = 2

function heightOf(value: number, max: number): number {
  return max === 0 || value === 0 ? EMPTY_PX : Math.max(EMPTY_PX, (value / max) * PLOT_PX)
}

// Hours and tokens per day in one chart, each scaled to its own maximum, side by side in their own colors.
export function DayChart({ days }: DayChartProps): React.JSX.Element {
  const withHours = days.some((day) => day.hours !== null)
  const maxHours = Math.max(0, ...days.map((day) => day.hours ?? 0))
  const maxTokens = Math.max(0, ...days.map((day) => day.tokens))
  const full = days.length <= FULL_LABEL_DAYS
  return (
    <Card>
      <Card.Content className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-sm font-semibold">{t('insights.byDay')}</h2>
          <span className="flex items-center gap-3 text-xs text-muted">
            {withHours ? (
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-sm bg-accent" aria-hidden="true" />
                {t('insights.hoursLegend')}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-violet-500" aria-hidden="true" />
              tokens
            </span>
          </span>
        </div>
        <div className="flex items-end gap-1 overflow-x-auto pb-1">
          {days.map((day) => {
            const values = [
              ...(day.hours === null ? [] : [formatHours(day.hours)]),
              formatTokens(day.tokens),
            ]
            const label = dayLabel(day.day)
            return (
              <Tip
                key={day.day}
                className="flex min-w-7 flex-1 flex-col items-center gap-1"
                content={`${label}: ${values.join(' · ')}`}
              >
                <span
                  role="img"
                  aria-label={`${label}: ${values.join(', ')}`}
                  className="flex items-end gap-0.5"
                  style={{ height: PLOT_PX }}
                >
                  {day.hours === null ? null : (
                    <span
                      className="w-3 rounded-t bg-accent"
                      style={{ height: heightOf(day.hours, maxHours) }}
                    />
                  )}
                  <span
                    className="w-3 rounded-t bg-violet-500"
                    style={{ height: heightOf(day.tokens, maxTokens) }}
                  />
                </span>
                <span className="whitespace-nowrap text-[11px] text-muted">
                  {full ? label : day.day.slice(8).replace(/^0/, '')}
                </span>
                {full ? (
                  // No room on a phone: the tooltip has them.
                  <span className="whitespace-nowrap text-[11px] tabular-nums max-[719px]:hidden">
                    {values.join(' · ')}
                  </span>
                ) : null}
              </Tip>
            )
          })}
        </div>
      </Card.Content>
    </Card>
  )
}
