import type { ReportRangeKind } from '@workday/core'
import { Segmented } from '../settings/Segmented.js'
import { t } from '../i18n.js'
import type { InsightsRange } from './useInsights.js'

interface ReportHeaderProps {
  readonly range: InsightsRange
  readonly reading: boolean
  readonly hasReport: boolean
  readonly status: string
  readonly onRange: (range: InsightsRange) => void
  readonly onRefresh: () => void
  readonly onCopy: () => void
  readonly onExport: () => void
}

function kindLabel(kind: ReportRangeKind): string {
  switch (kind) {
    case 'thisWeek':
      return t('This week', 'Tuần này')
    case 'lastWeek':
      return t('Last week', 'Tuần trước')
    case 'thisMonth':
      return t('This month', 'Tháng này')
    case 'lastMonth':
      return t('Last month', 'Tháng trước')
    case 'custom':
      return t('Custom', 'Tùy chọn')
  }
}

const KINDS: readonly ReportRangeKind[] = [
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'custom',
]

interface DateFieldProps {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}

function DateField({ id, label, value, onChange }: DateFieldProps): React.JSX.Element {
  return (
    <label className="insights-date" htmlFor={id}>
      <span className="muted">{label}</span>
      <input
        id={id}
        type="date"
        className="wd-input"
        value={value}
        onChange={(event) => {
          // A cleared field is not a range; keep the last date.
          if (event.target.value !== '') {
            onChange(event.target.value)
          }
        }}
      />
    </label>
  )
}

export function ReportHeader(props: ReportHeaderProps): React.JSX.Element {
  const { range, reading } = props
  return (
    <div className="insights-header">
      <div className="insights-bar">
        <Segmented
          label={t('Range', 'Khoảng thời gian')}
          value={range.kind}
          options={KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
          onChange={(kind) => {
            props.onRange({ ...range, kind })
          }}
        />
        {range.kind === 'custom' ? (
          <>
            <DateField
              id="insights-from"
              label={t('From', 'Từ')}
              value={range.from}
              onChange={(from) => {
                props.onRange({ ...range, from })
              }}
            />
            <DateField
              id="insights-to"
              label={t('To', 'Đến')}
              value={range.to}
              onChange={(to) => {
                props.onRange({ ...range, to })
              }}
            />
          </>
        ) : null}
        <button
          type="button"
          className="wd-button secondary"
          disabled={reading}
          onClick={props.onRefresh}
        >
          {t('Refresh', 'Làm mới')}
        </button>
        <button
          type="button"
          className="wd-button secondary"
          disabled={!props.hasReport}
          onClick={props.onCopy}
        >
          {t('Copy markdown', 'Sao chép markdown')}
        </button>
        <button
          type="button"
          className="wd-button secondary"
          disabled={!props.hasReport}
          onClick={props.onExport}
        >
          {t('Export CSV...', 'Xuất CSV...')}
        </button>
      </div>
      <div className="muted insights-status" aria-live="polite">
        {reading ? t('Reading the report...', 'Đang đọc báo cáo...') : props.status}
      </div>
    </div>
  )
}
