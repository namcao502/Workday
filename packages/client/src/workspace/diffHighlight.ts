import { highlightLines } from '../ui/highlight.js'
import type { DiffRow } from './diffRows.js'

// HTML per row, each side coloured as one text so a multi-line comment keeps its colour; '' for a gap.
export function highlightRows(
  rows: readonly DiffRow[],
  language: string | null,
): readonly string[] {
  const newSide = rows.filter((row) => row.kind === 'context' || row.kind === 'added')
  const oldSide = rows.filter((row) => row.kind === 'context' || row.kind === 'removed')
  const newHtml = highlightLines(newSide.map((row) => row.text).join('\n'), language)
  const oldHtml = highlightLines(oldSide.map((row) => row.text).join('\n'), language)
  let newIndex = 0
  let oldIndex = 0
  return rows.map((row) => {
    if (row.kind === 'gap') {
      return ''
    }
    const fromOld = row.kind === 'removed' ? oldHtml[oldIndex] : undefined
    const fromNew = row.kind === 'removed' ? undefined : newHtml[newIndex]
    if (row.kind !== 'added') {
      oldIndex += 1
    }
    if (row.kind !== 'removed') {
      newIndex += 1
    }
    return fromOld ?? fromNew ?? ''
  })
}
