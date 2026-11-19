import { useLayoutEffect, useMemo, useRef } from 'react'
import { useDiff } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { copyNewSide } from './diffCopy.js'
import { changeRuns, measureOverview } from './diffOverview.js'
import { highlightRows } from './diffHighlight.js'
import { languageOf } from '../ui/highlight.js'
import type { OverviewMark } from '../ui/OverviewRuler.js'
import { diffRows } from './diffRows.js'

interface DiffViewProps {
  readonly tabId: string
  readonly group: string
  readonly path: string
  readonly onOverview?: ((marks: readonly OverviewMark[]) => void) | undefined
}

const MARKS = { context: ' ', added: '+', removed: '-', gap: '' } as const

export function DiffView({ tabId, group, path, onOverview }: DiffViewProps): React.JSX.Element {
  const { data, isError } = useDiff(tabId, group, path)
  const table = useRef<HTMLTableElement>(null)
  const rows = useMemo(
    () => (data === undefined || data.kind === 'binary' ? [] : diffRows(data)),
    [data],
  )
  const highlighted = useMemo(() => highlightRows(rows, languageOf(path)), [rows, path])

  // Re-measured on resize, since a narrower pane wraps more lines.
  useLayoutEffect(() => {
    const element = table.current
    if (onOverview === undefined || element === null) {
      return undefined
    }
    const runs = changeRuns(rows)
    const measure = (): void => {
      onOverview(measureOverview(element, runs))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      onOverview([])
    }
  }, [rows, onOverview])
  if (isError) {
    return <p className="text-sm text-danger">{t('workspace.couldNotLoadTheDiff')}</p>
  }
  if (data === undefined) {
    return <p className="text-sm text-muted">{t('workspace.loading')}</p>
  }
  if (data.kind === 'binary') {
    return <p className="text-sm text-muted">{t('workspace.binaryOrTooLargeToShow')}</p>
  }
  return (
    <table ref={table} className="diff-view" onCopy={copyNewSide}>
      <tbody>
        {rows.map((row, index) =>
          row.kind === 'gap' ? (
            <tr key={index} className="diff-gap">
              <td colSpan={4}>
                {row.text === ''
                  ? t('workspace.unchangedLines', { hiddenCount: String(row.hiddenCount) })
                  : row.text}
              </td>
            </tr>
          ) : (
            <tr key={index} className={`diff-${row.kind}`}>
              <td className="diff-number">{row.oldLine ?? ''}</td>
              <td className="diff-number">{row.newLine ?? ''}</td>
              <td className="diff-mark">{MARKS[row.kind]}</td>
              {/* highlightRows escapes the text; the only markup is highlight.js spans. */}
              <td
                className="diff-text"
                dangerouslySetInnerHTML={{ __html: highlighted[index] ?? '' }}
              />
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}
