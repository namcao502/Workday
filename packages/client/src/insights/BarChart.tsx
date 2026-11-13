import { t } from '../i18n.js'

export interface Bar {
  readonly label: string
  readonly value: number
}

interface BarChartProps {
  readonly title: string
  readonly bars: readonly Bar[]
  readonly formatValue: (value: number) => string
  readonly horizontal?: boolean // by ticket: top 10 + Other; false = one column per day
}

const MAX_BARS = 10
const ROW_H = 20
const BAR_H = 12
const LABEL_W = 84
const VALUE_W = 56
const PLOT_W = 260
const COLUMN_W = 34
const COLUMN_PLOT_H = 110
const LABEL_H = 18

// The ten biggest bars as they are; every other one is summed into "Other (n)".
export function foldIntoOther(bars: readonly Bar[]): readonly Bar[] {
  const sorted = [...bars].sort((a, b) => b.value - a.value)
  if (sorted.length <= MAX_BARS) {
    return sorted
  }
  const folded = sorted.slice(MAX_BARS)
  const sum = folded.reduce((total, bar) => total + bar.value, 0)
  return [
    ...sorted.slice(0, MAX_BARS),
    { label: `${t('Other', 'Khác')} (${String(folded.length)})`, value: sum },
  ]
}

function Rows({
  title,
  bars,
  formatValue,
}: Pick<BarChartProps, 'title' | 'bars' | 'formatValue'>): React.JSX.Element {
  const max = Math.max(...bars.map((bar) => bar.value), 0)
  const height = bars.length * ROW_H
  return (
    <svg
      className="bar-chart-svg"
      viewBox={`0 0 ${String(LABEL_W + PLOT_W + VALUE_W)} ${String(height)}`}
      role="img"
      aria-label={title}
    >
      {bars.map((bar, index) => {
        const y = index * ROW_H
        const width = max > 0 ? (bar.value / max) * PLOT_W : 0
        return (
          <g key={bar.label} className="bar-row">
            <title>{`${bar.label}: ${formatValue(bar.value)}`}</title>
            <text className="bar-label" x={LABEL_W - 8} y={y + ROW_H / 2} textAnchor="end">
              {bar.label}
            </text>
            <rect
              className="bar"
              x={LABEL_W}
              y={y + (ROW_H - BAR_H) / 2}
              width={width}
              height={BAR_H}
              rx={2}
            />
            <text className="bar-value" x={LABEL_W + width + 6} y={y + ROW_H / 2}>
              {formatValue(bar.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Columns({
  title,
  bars,
  formatValue,
}: Pick<BarChartProps, 'title' | 'bars' | 'formatValue'>): React.JSX.Element {
  const max = Math.max(...bars.map((bar) => bar.value), 0)
  const width = Math.max(bars.length, 1) * COLUMN_W
  return (
    <svg
      className="bar-chart-svg bar-chart-columns"
      viewBox={`0 0 ${String(width)} ${String(COLUMN_PLOT_H + LABEL_H)}`}
      role="img"
      aria-label={title}
    >
      {bars.map((bar, index) => {
        const barHeight = max > 0 ? (bar.value / max) * (COLUMN_PLOT_H - LABEL_H) : 0
        const x = index * COLUMN_W
        return (
          <g key={bar.label} className="bar-row">
            <title>{`${bar.label}: ${formatValue(bar.value)}`}</title>
            <rect
              className="bar"
              x={x + 6}
              y={COLUMN_PLOT_H - barHeight}
              width={COLUMN_W - 12}
              height={barHeight}
              rx={2}
            />
            <text
              className="bar-value"
              x={x + COLUMN_W / 2}
              y={COLUMN_PLOT_H - barHeight - 4}
              textAnchor="middle"
            >
              {formatValue(bar.value)}
            </text>
            <text
              className="bar-label"
              x={x + COLUMN_W / 2}
              y={COLUMN_PLOT_H + 12}
              textAnchor="middle"
            >
              {bar.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function BarChart({
  title,
  bars,
  formatValue,
  horizontal = true,
}: BarChartProps): React.JSX.Element {
  const shown = horizontal ? foldIntoOther(bars) : bars
  return (
    <figure className="bar-chart">
      <figcaption className="section-label">{title}</figcaption>
      {shown.length === 0 ? (
        <p className="muted">{t('No data', 'Không có dữ liệu')}</p>
      ) : horizontal ? (
        <Rows title={title} bars={shown} formatValue={formatValue} />
      ) : (
        <Columns title={title} bars={shown} formatValue={formatValue} />
      )}
    </figure>
  )
}
