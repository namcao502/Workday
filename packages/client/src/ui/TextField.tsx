import { Description, Input, Label, TextArea, TextField as HeroTextField } from '@heroui/react'

export const TEXTAREA_ROWS = 10

interface TextFieldProps {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly type?: 'text' | 'email'
  readonly multiline?: boolean
}

// A labelled input with a one-line hint under it; multiline makes it a fixed ten-line textarea.
export function TextField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
  multiline = false,
}: TextFieldProps): React.JSX.Element {
  const placeholderProps = placeholder === undefined ? {} : { placeholder }
  return (
    <HeroTextField fullWidth value={value} onChange={onChange} type={type}>
      <Label>{label}</Label>
      {multiline ? (
        <TextArea
          id={id}
          rows={TEXTAREA_ROWS}
          variant="secondary"
          className="resize-none"
          {...placeholderProps}
        />
      ) : (
        <Input id={id} variant="secondary" {...placeholderProps} />
      )}
      <Description>{hint}</Description>
    </HeroTextField>
  )
}
