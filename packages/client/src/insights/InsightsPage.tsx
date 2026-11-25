import { reportCsv, reportMarkdown, type TicketReport } from '@workday/core'
import { useState } from 'react'
import { actionErrorText } from '../api/useWork.js'
import { Page } from '../ui/Page.js'
import { useSettings } from '../api/useSettings.js'
import { formatClock, getLanguage, t } from '../i18n.js'
import { ReportBody } from './ReportBody.js'
import { ReportActions, ReportHeader, ReportRange } from './ReportHeader.js'
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
        setNotice(t('insights.reportCopiedAsMarkdown'))
      },
      () => {
        setNotice(t('insights.couldNotCopyTheReport'))
      },
    )
  }

  function exportCsv(): void {
    if (view === null) {
      return
    }
    downloadCsv(view.report)
    setNotice(t('insights.reportExportedAsCsv'))
  }

  const readAt =
    view === null
      ? ''
      : t('insights.readAt', {
          formatClock: formatClock(
            new Date(view.readAt),
            getLanguage(),
            settings?.timeZone ?? 'UTC',
          ),
        })

  return (
    <Page
      title={t('insights.insights')}
      wide
      actions={
        <div className="flex min-w-0 items-center gap-2">
          <ReportRange
            range={insights.range}
            onRange={(range) => {
              setNotice('')
              insights.setRange(range)
            }}
          />
          <ReportActions
            reading={insights.reading}
            hasReport={view !== null}
            onRefresh={insights.reread}
            onCopy={copy}
            onExport={exportCsv}
          />
        </div>
      }
    >
      <ReportHeader
        range={insights.range}
        reading={insights.reading}
        status={notice === '' ? readAt : notice}
        onRange={(range) => {
          setNotice('')
          insights.setRange(range)
        }}
      />
      {insights.error === null ? null : (
        <p className="text-sm text-danger" role="alert">
          {actionErrorText(insights.error)}
        </p>
      )}
      {view === null ? null : <ReportBody report={view.report} urlFor={urlFor} />}
    </Page>
  )
}
