import { HOURS_STEP_MINUTES, moveBoundary, WORK_MINUTES } from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'
import { formatMinutes } from './timesheetText.js'

interface HoursBarProps {
  readonly minutes: readonly number[]
  readonly labels: readonly string[]
  readonly onCommit?: ((minutes: readonly number[]) => void) | undefined // absent = read only
}

function sameMinutes(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

// One segment per ticket plus the free rest of the 8h; boundaries drag in 30-minute steps.
export function HoursBar({ minutes, labels, onCommit }: HoursBarProps): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{
    readonly index: number
    readonly start: readonly number[]
  } | null>(null)
  const [draft, setDraft] = useState<readonly number[] | null>(null)
  const draftRef = useRef<readonly number[] | null>(null)
  const shown = draft ?? minutes

  useEffect(() => {
    if (dragging === null) {
      return undefined
    }
    function onMove(event: MouseEvent): void {
      const rect = barRef.current?.getBoundingClientRect()
      if (rect === undefined || rect.width === 0 || dragging === null) {
        return
      }
      const next = moveBoundary(
        dragging.start,
        dragging.index,
        ((event.clientX - rect.left) / rect.width) * WORK_MINUTES,
      )
      draftRef.current = next
      setDraft(next)
    }
    function onUp(): void {
      const final = draftRef.current
      draftRef.current = null
      setDragging(null)
      setDraft(null)
      if (final !== null && dragging !== null && !sameMinutes(final, dragging.start)) {
        onCommit?.(final)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, onCommit])

  let end = 0
  const segments = shown.map((value, index) => {
    const start = end
    end += value
    return { key: labels[index] ?? String(index), value, start, end }
  })

  function nudge(index: number, direction: 1 | -1): void {
    const boundary = (segments[index]?.end ?? 0) + direction * HOURS_STEP_MINUTES
    onCommit?.(moveBoundary(minutes, index, boundary))
  }

  return (
    <div
      className="relative h-8 rounded-lg bg-surface-secondary"
      ref={barRef}
      data-testid="hours-bar"
      data-hours-bar
    >
      {segments.map((segment, index) => (
        <div
          key={segment.key}
          className="absolute inset-y-0 overflow-hidden rounded-lg bg-accent-soft text-accent-soft-foreground"
          data-testid={`segment-${segment.key}`}
          style={{
            left: `${String((segment.start / WORK_MINUTES) * 100)}%`,
            width: `${String((segment.value / WORK_MINUTES) * 100)}%`,
          }}
          title={`${segment.key} ${formatMinutes(segment.value)}`}
        >
          <span className="whitespace-nowrap px-2 text-xs leading-8">{segment.key}</span>
          {onCommit === undefined ? null : (
            <div
              className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none rounded-full bg-accent"
              role="slider"
              tabIndex={0}
              aria-label={t(`Boundary after ${segment.key}`, `Ranh sau ${segment.key}`)}
              aria-valuemin={0}
              aria-valuemax={WORK_MINUTES}
              aria-valuenow={segment.end}
              onPointerDown={(event) => {
                event.preventDefault()
                setDragging({ index, start: minutes })
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  nudge(index, event.key === 'ArrowRight' ? 1 : -1)
                }
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
