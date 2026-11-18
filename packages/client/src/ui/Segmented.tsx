import { useLayoutEffect, useRef, useState } from 'react'
import { SEGMENT_GROUP, segmentClass } from './segmentedStyle.js'

interface Overflow {
  readonly left: boolean
  readonly right: boolean
}

const NO_OVERFLOW: Overflow = { left: false, right: false }
const FADE_LEFT = '[mask-image:linear-gradient(to_right,transparent,black_2rem)]'
const FADE_RIGHT = '[mask-image:linear-gradient(to_left,transparent,black_2rem)]'
const FADE_BOTH =
  '[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]'

function fadeClass(overflow: Overflow): string {
  if (overflow.left && overflow.right) {
    return FADE_BOTH
  }
  return overflow.left ? FADE_LEFT : overflow.right ? FADE_RIGHT : ''
}

// Which edges hide a choice: a narrow screen scrolls the row, and the fade says there is more.
function useOverflow(group: React.RefObject<HTMLDivElement | null>): Overflow {
  const [overflow, setOverflow] = useState(NO_OVERFLOW)
  useLayoutEffect(() => {
    const element = group.current
    if (element === null) {
      return
    }
    function measure(): void {
      if (element === null) {
        return
      }
      const left = element.scrollLeft > 1
      const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1
      setOverflow((current) =>
        current.left === left && current.right === right ? current : { left, right },
      )
    }
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => {
      element.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [group])
  return overflow
}

interface SegmentedProps<Value extends string> {
  readonly label: string
  readonly value: Value
  readonly options: readonly {
    readonly value: Value
    readonly label: string
    readonly dot?: boolean // a small badge after the label, e.g. something new in that view
  }[]
  readonly onChange: (value: Value) => void
}

// A single choice among a few, drawn like the Changes / Files / Teams tabs; arrow keys move the choice.
export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<Value>): React.JSX.Element {
  const group = useRef<HTMLDivElement>(null)
  const overflow = useOverflow(group)
  const selectedIndex = options.findIndex((option) => option.value === value)

  // Keep the chosen view in sight when the row scrolls.
  useLayoutEffect(() => {
    const button = group.current?.children[selectedIndex]
    if (button instanceof HTMLElement && typeof button.scrollIntoView === 'function') {
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [selectedIndex])

  function move(from: number, step: number): void {
    const next = options[(from + step + options.length) % options.length]
    if (next !== undefined) {
      onChange(next.value)
    }
  }
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className={`${SEGMENT_GROUP} ${fadeClass(overflow)}`}
      data-overflow={overflow.left || overflow.right ? 'true' : undefined}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={segmentClass(selected)}
            onClick={() => {
              onChange(option.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault()
                move(index, 1)
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault()
                move(index, -1)
              }
            }}
          >
            {option.label}
            {option.dot === true ? (
              <span
                data-testid="view-dot"
                aria-hidden="true"
                className="size-2 rounded-full bg-danger"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
