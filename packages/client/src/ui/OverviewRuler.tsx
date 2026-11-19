import { useLayoutEffect, useState } from 'react'
import { t } from '../i18n.js'

export interface OverviewMark {
  readonly kind: 'added' | 'removed'
  readonly top: number // fraction of the scrolled content
  readonly height: number // fraction of the scrolled content
}

interface OverviewRulerProps {
  readonly marks: readonly OverviewMark[]
  readonly scroller: React.RefObject<HTMLDivElement | null>
}

const MIN_MARK_PX = 3

// Monaco-style strip beside the scrollbar: where the changes sit in the whole file, and a click jumps there.
export function OverviewRuler({ marks, scroller }: OverviewRulerProps): React.JSX.Element {
  const [scrollbar, setScrollbar] = useState(0)

  // Sits just left of the scrollbar, whose width depends on the platform.
  useLayoutEffect(() => {
    const element = scroller.current
    if (element === null) {
      return undefined
    }
    const measure = (): void => {
      setScrollbar(element.offsetWidth - element.clientWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [scroller])

  function jump(mark: OverviewMark): void {
    const element = scroller.current
    if (element !== null) {
      element.scrollTop = Math.max(0, mark.top * element.scrollHeight - element.clientHeight / 3)
    }
  }

  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 w-1.5"
      style={{ right: scrollbar + 1 }}
    >
      {marks.map((mark, index) => (
        <button
          key={index}
          type="button"
          tabIndex={-1}
          aria-label={
            mark.kind === 'added' ? t('ui.goToTheAddedLines') : t('ui.goToTheRemovedLines')
          }
          className={`pointer-events-auto absolute left-0 w-full cursor-pointer rounded-sm ${
            mark.kind === 'added' ? 'bg-success' : 'bg-danger'
          }`}
          style={{
            top: `${String(mark.top * 100)}%`,
            height: `max(${String(MIN_MARK_PX)}px, ${String(mark.height * 100)}%)`,
          }}
          onClick={() => {
            jump(mark)
          }}
        />
      ))}
    </div>
  )
}
