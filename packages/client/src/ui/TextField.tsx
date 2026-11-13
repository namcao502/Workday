import { Description, Input, Label, TextArea, TextField as HeroTextField } from '@heroui/react'

interface TextFieldProps {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly type?: 'text' | 'email'
  readonly rows?: number
}

// A labelled input with a one-line hint under it; rows turns it into a textarea.
export function TextField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
  rows,
}: TextFieldProps): React.JSX.Element {
  const placeholderProps = placeholder === undefined ? {} : { placeholder }
  return (
    <HeroTextField fullWidth value={value} onChange={onChange} type={type}>
      <Label>{label}</Label>
      {rows === undefined ? (
        <Input id={id} variant="secondary" {...placeholderProps} />
      ) : (
        <TextArea id={id} rows={rows} variant="secondary" {...placeholderProps} />
      )}
      <Description>{hint}</Description>
    </HeroTextField>
  )
}
