import { ToggleButton, ToggleButtonGroup } from '@heroui/react'

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
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      size="sm"
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const picked = options.find((option) => keys.has(option.value))
        if (picked !== undefined) {
          onChange(picked.value)
        }
      }}
    >
      {options.map((option) => (
        <ToggleButton key={option.value} id={option.value}>
          {option.label}
          {option.dot === true ? (
            <span
              data-testid="view-dot"
              aria-hidden="true"
              className="size-1.5 rounded-full bg-accent"
            />
          ) : null}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
