import { SEGMENT_GROUP, segmentClass } from './segmentedStyle.js'

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
  function move(from: number, step: number): void {
    const next = options[(from + step + options.length) % options.length]
    if (next !== undefined) {
      onChange(next.value)
    }
  }
  return (
    <div role="radiogroup" aria-label={label} className={SEGMENT_GROUP}>
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
                className="size-1.5 rounded-full bg-accent"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
