import type { OverviewMark } from '../ui/OverviewRuler.js'
import type { DiffRow } from './diffRows.js'

export interface ChangeRun {
  readonly kind: 'added' | 'removed'
  readonly start: number // row index, inclusive
  readonly end: number // row index, inclusive
}

export function changeRuns(rows: readonly DiffRow[]): readonly ChangeRun[] {
  const runs: ChangeRun[] = []
  rows.forEach((row, index) => {
    if (row.kind !== 'added' && row.kind !== 'removed') {
      return
    }
    const last = runs.at(-1)
    if (last !== undefined && last.kind === row.kind && last.end === index - 1) {
      runs[runs.length - 1] = { ...last, end: index }
    } else {
      runs.push({ kind: row.kind, start: index, end: index })
    }
  })
  return runs
}

// Measured from the rendered rows, since a long line wraps and takes more than one row's height.
export function measureOverview(
  table: HTMLTableElement,
  runs: readonly ChangeRun[],
): readonly OverviewMark[] {
  const total = table.offsetHeight
  if (total === 0) {
    return []
  }
  return runs.flatMap((run) => {
    const first = table.rows[run.start]
    const last = table.rows[run.end]
    if (first === undefined || last === undefined) {
      return []
    }
    const bottom = last.offsetTop + last.offsetHeight
    return [
      { kind: run.kind, top: first.offsetTop / total, height: (bottom - first.offsetTop) / total },
    ]
  })
}
