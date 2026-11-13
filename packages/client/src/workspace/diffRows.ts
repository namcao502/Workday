import type { DiffView } from '@workday/core'
import { diffLines } from 'diff'
import { t } from '../i18n.js'

export interface DiffRow {
  readonly kind: 'context' | 'added' | 'removed' | 'gap'
  readonly text: string
  readonly oldLine: number | null
  readonly newLine: number | null
  readonly hiddenCount: number // gap only
}

type TextDiff = Extract<DiffView, { kind: 'full' | 'excerpt' }>

function splitLines(text: string): readonly string[] {
  if (text === '') {
    return []
  }
  const lines = text.split('\n')
  return text.endsWith('\n') ? lines.slice(0, -1) : lines
}

// Every line gets a newline so "a" and "a\n" at the end of a file compare equal.
function joinLines(lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join('')
}

function row(
  kind: DiffRow['kind'],
  text: string,
  oldLine: number | null,
  newLine: number | null,
): DiffRow {
  return { kind, text, oldLine, newLine, hiddenCount: 0 }
}

// oldNumbers / newNumbers give the line number of each line; a full file counts up from 1.
function diffSegment(
  original: readonly string[],
  modified: readonly string[],
  oldNumbers: readonly number[],
  newNumbers: readonly number[],
): readonly DiffRow[] {
  const rows: DiffRow[] = []
  let oldIndex = 0
  let newIndex = 0
  for (const change of diffLines(joinLines(original), joinLines(modified))) {
    for (const text of splitLines(change.value)) {
      if (change.added) {
        rows.push(row('added', text, null, newNumbers[newIndex] ?? null))
        newIndex += 1
      } else if (change.removed) {
        rows.push(row('removed', text, oldNumbers[oldIndex] ?? null, null))
        oldIndex += 1
      } else {
        rows.push(row('context', text, oldNumbers[oldIndex] ?? null, newNumbers[newIndex] ?? null))
        oldIndex += 1
        newIndex += 1
      }
    }
  }
  return rows
}

function counting(length: number): readonly number[] {
  return Array.from({ length }, (_, index) => index + 1)
}

// Lines numbered 0 are gap markers; the arrays are split into runs between them.
function runs(lines: readonly string[], numbers: readonly number[]): readonly Run[] {
  const result: { lines: string[]; numbers: number[] }[] = [{ lines: [], numbers: [] }]
  lines.forEach((text, index) => {
    const number = numbers[index] ?? 0
    if (number === 0) {
      result.push({ lines: [], numbers: [] })
      return
    }
    const last = result[result.length - 1]
    last?.lines.push(text)
    last?.numbers.push(number)
  })
  return result
}

interface Run {
  readonly lines: readonly string[]
  readonly numbers: readonly number[]
}

function gapRow(text: string, hiddenCount: number): DiffRow {
  return { kind: 'gap', text, oldLine: null, newLine: null, hiddenCount }
}

function excerptRows(view: Extract<TextDiff, { kind: 'excerpt' }>): readonly DiffRow[] {
  const originalRuns = runs(splitLines(view.original), view.originalLines)
  const modifiedRuns = runs(splitLines(view.modified), view.modifiedLines)
  const rows: DiffRow[] = []
  originalRuns.forEach((originalRun, index) => {
    const modifiedRun = modifiedRuns[index] ?? { lines: [], numbers: [] }
    const segment = diffSegment(
      originalRun.lines,
      modifiedRun.lines,
      originalRun.numbers,
      modifiedRun.numbers,
    )
    if (index > 0) {
      const from = rows.findLast((item) => item.oldLine !== null)?.oldLine ?? 0
      const to = segment.find((item) => item.oldLine !== null)?.oldLine ?? from + 1
      rows.push(gapRow('', Math.max(0, to - from - 1)))
    }
    rows.push(...segment)
  })
  if (view.truncated) {
    rows.push(gapRow(t('(truncated)', '(đã cắt bớt)'), 0))
  }
  return rows
}

export function diffRows(view: TextDiff): readonly DiffRow[] {
  if (view.kind === 'excerpt') {
    return excerptRows(view)
  }
  const original = splitLines(view.original)
  const modified = splitLines(view.modified)
  return diffSegment(original, modified, counting(original.length), counting(modified.length))
}
