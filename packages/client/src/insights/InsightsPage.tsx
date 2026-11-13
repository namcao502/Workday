import { reportCsv, reportMarkdown, type TicketReport } from '@workday/core'
import { useState } from 'react'
import { actionErrorText } from '../api/useWork.js'
import { useSettings } from '../api/useSettings.js'
import { formatClock, getLanguage, t } from '../i18n.js'
import './insights.css'
import { ReportBody } from './ReportBody.js'
import { ReportHeader } from './ReportHeader.js'
import { useInsights } from './useInsights.js'

const UTF8_BOM = '\uFEFF'

// Saves the CSV with a BOM so Excel reads it as UTF-8.
function downloadCsv(report: TicketReport): void {
  const blob = new Blob([UTF8_BOM, reportCsv(report)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `workday-report-${report.range.from}-${report.range.to}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function InsightsPage(): React.JSX.Element {
  const insights = useInsights()
  const settings = useSettings().data?.config
  const [notice, setNotice] = useState('')
  const { view } = insights
  const baseUrl = settings?.jira?.baseUrl
  const urlFor = (key: string): string | null =>
    baseUrl === undefined ? null : `${baseUrl}/browse/${key}`

  function copy(): void {
    if (view === null) {
      return
    }
    navigator.clipboard.writeText(reportMarkdown(view.report)).then(
      () => {
        setNotice(t('Report copied as markdown', 'Đã sao chép báo cáo dạng markdown'))
      },
      () => {
        setNotice(t('Could not copy the report', 'Không sao chép được báo cáo'))
      },
    )
  }

  function exportCsv(): void {
    if (view === null) {
      return
    }
    downloadCsv(view.report)
    setNotice(t('Report exported as CSV', 'Đã xuất báo cáo ra CSV'))
  }

  const readAt =
    view === null
      ? ''
      : t(
          `Read at ${formatClock(new Date(view.readAt), getLanguage(), settings?.timeZone ?? 'UTC')}`,
          `Đã đọc lúc ${formatClock(new Date(view.readAt), getLanguage(), settings?.timeZone ?? 'UTC')}`,
        )

  return (
    <section className="page insights-page">
      <h1 className="page-title">{t('Insights', 'Thống kê')}</h1>
      <ReportHeader
        range={insights.range}
        reading={insights.reading}
        hasReport={view !== null}
        status={notice === '' ? readAt : notice}
        onRange={(range) => {
          setNotice('')
          insights.setRange(range)
        }}
        onRefresh={insights.reread}
        onCopy={copy}
        onExport={exportCsv}
      />
      {insights.error === null ? null : (
        <p className="insights-error" role="alert">
          {actionErrorText(insights.error)}
        </p>
      )}
      {view === null ? null : <ReportBody report={view.report} urlFor={urlFor} />}
    </section>
  )
}
