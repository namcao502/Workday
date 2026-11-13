import { useMemo } from 'react'
import { useDiff } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { diffRows } from './diffRows.js'

interface DiffViewProps {
  readonly tabId: string
  readonly group: string
  readonly path: string
}

const MARKS = { context: ' ', added: '+', removed: '-', gap: '' } as const

export function DiffView({ tabId, group, path }: DiffViewProps): React.JSX.Element {
  const { data, isError } = useDiff(tabId, group, path)
  const rows = useMemo(
    () => (data === undefined || data.kind === 'binary' ? [] : diffRows(data)),
    [data],
  )
  if (isError) {
    return (
      <p className="text-sm text-danger">{t('Could not load the diff.', 'Không tải được diff.')}</p>
    )
  }
  if (data === undefined) {
    return <p className="text-sm text-muted">{t('Loading...', 'Đang tải...')}</p>
  }
  if (data.kind === 'binary') {
    return (
      <p className="text-sm text-muted">
        {t('(binary or too large to show)', '(tệp nhị phân hoặc quá lớn để hiển thị)')}
      </p>
    )
  }
  return (
    <table className="diff-view">
      <tbody>
        {rows.map((row, index) =>
          row.kind === 'gap' ? (
            <tr key={index} className="diff-gap">
              <td colSpan={4}>
                {row.text === ''
                  ? t(
                      `${String(row.hiddenCount)} unchanged lines`,
                      `${String(row.hiddenCount)} dòng không đổi`,
                    )
                  : row.text}
              </td>
            </tr>
          ) : (
            <tr key={index} className={`diff-${row.kind}`}>
              <td className="diff-number">{row.oldLine ?? ''}</td>
              <td className="diff-number">{row.newLine ?? ''}</td>
              <td className="diff-mark">{MARKS[row.kind]}</td>
              <td className="diff-text">{row.text}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}
