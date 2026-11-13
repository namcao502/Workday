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

export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<Value>): React.JSX.Element {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="segment"
          onClick={() => {
            onChange(option.value)
          }}
        >
          {option.label}
          {option.dot === true ? <span className="view-dot" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  )
}
