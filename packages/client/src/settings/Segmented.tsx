interface SegmentedProps<Value extends string> {
  readonly label: string
  readonly value: Value
  readonly options: readonly { readonly value: Value; readonly label: string }[]
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
        </button>
      ))}
    </div>
  )
}
