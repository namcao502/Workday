import { Button, Input } from '@heroui/react'
import type { ReportRangeKind } from '@workday/core'
import { Segmented } from '../ui/Segmented.js'
import { t } from '../i18n.js'
import type { InsightsRange } from './useInsights.js'

interface ReportHeaderProps {
  readonly range: InsightsRange
  readonly onRange: (range: InsightsRange) => void
}

interface ReportActionsProps {
  readonly reading: boolean
  readonly hasReport: boolean
  readonly onRefresh: () => void
  readonly onCopy: () => void
  readonly onExport: () => void
}

// The report's actions; the page puts them in the top bar, next to the title.
export function ReportActions(props: ReportActionsProps): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2 max-[719px]:shrink max-[719px]:flex-wrap">
      <Button variant="secondary" size="sm" isDisabled={props.reading} onPress={props.onRefresh}>
        {t('insights.refresh')}
      </Button>
      <Button variant="secondary" size="sm" isDisabled={!props.hasReport} onPress={props.onCopy}>
        {t('insights.copyMarkdown')}
      </Button>
      <Button variant="secondary" size="sm" isDisabled={!props.hasReport} onPress={props.onExport}>
        {t('insights.exportCsv')}
      </Button>
    </div>
  )
}

function kindLabel(kind: ReportRangeKind): string {
  switch (kind) {
    case 'thisWeek':
      return t('insights.thisWeek')
    case 'lastWeek':
      return t('insights.lastWeek')
    case 'thisMonth':
      return t('insights.thisMonth')
    case 'lastMonth':
      return t('insights.lastMonth')
    case 'custom':
      return t('insights.custom')
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

interface ReportRangeProps {
  readonly range: InsightsRange
  readonly onRange: (range: InsightsRange) => void
}

// The range switch; the page puts it in the top bar. min-w-0 lets it scroll sideways on a narrow bar.
export function ReportRange({ range, onRange }: ReportRangeProps): React.JSX.Element {
  return (
    <div className="flex min-w-0">
      <Segmented
        label={t('insights.range')}
        value={range.kind}
        options={KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
        onChange={(kind) => {
          onRange({ ...range, kind })
        }}
      />
    </div>
  )
}

interface ReportStatusProps {
  readonly reading: boolean
  readonly status: string
}

// "Read at ..." or a copy/export notice; the page puts it in the top bar.
export function ReportStatus({ reading, status }: ReportStatusProps): React.JSX.Element {
  return (
    <span className="truncate whitespace-nowrap text-sm text-muted" aria-live="polite">
      {reading ? t('insights.readingTheReport') : status}
    </span>
  )
}

// Under the top bar: the from / to dates, only for a custom range.
export function ReportHeader({ range, onRange }: ReportHeaderProps): React.JSX.Element | null {
  if (range.kind !== 'custom') {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <DateField
        id="insights-from"
        label={t('insights.from')}
        value={range.from}
        onChange={(from) => {
          onRange({ ...range, from })
        }}
      />
      <DateField
        id="insights-to"
        label={t('insights.to')}
        value={range.to}
        onChange={(to) => {
          onRange({ ...range, to })
        }}
      />
    </div>
  )
}
