import { Button, Input } from '@heroui/react'
import type { ReportRangeKind } from '@workday/core'
import { Segmented } from '../ui/Segmented.js'
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
    <label className="flex items-center gap-2" htmlFor={id}>
      <span className="text-sm text-muted">{label}</span>
      <Input
        id={id}
        type="date"
        className="w-40"
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
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
        <Button variant="secondary" size="sm" isDisabled={reading} onPress={props.onRefresh}>
          {t('Refresh', 'Làm mới')}
        </Button>
        <Button variant="secondary" size="sm" isDisabled={!props.hasReport} onPress={props.onCopy}>
          {t('Copy markdown', 'Sao chép markdown')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={!props.hasReport}
          onPress={props.onExport}
        >
          {t('Export CSV...', 'Xuất CSV...')}
        </Button>
      </div>
      <div className="min-h-6 text-sm text-muted" aria-live="polite">
        {reading ? t('Reading the report...', 'Đang đọc báo cáo...') : props.status}
      </div>
    </div>
  )
}
