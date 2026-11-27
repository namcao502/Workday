import { Description, Input, Label, TextArea, TextField as HeroTextField } from '@heroui/react'

export const TEXTAREA_ROWS = 10

// Inside a wide enough @container (the Settings pane) a field reads as a row: label and hint on the left, the
// control on the right at a readable width. Anywhere else it stays stacked.
export const SIDE_FIELD = {
  root: '@2xl:grid @2xl:grid-cols-[14rem_minmax(0,32rem)] @2xl:grid-rows-[auto_1fr] @2xl:gap-x-6 @2xl:gap-y-0.5',
  label: '@2xl:col-start-1 @2xl:row-start-1 @2xl:pt-2',
  control: '@2xl:col-start-2 @2xl:row-span-2 @2xl:row-start-1 @2xl:self-start',
  hint: '@2xl:col-start-1 @2xl:row-start-2 @2xl:self-start',
} as const

interface TextFieldProps {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly type?: 'text' | 'email' | 'password'
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
    <HeroTextField
      fullWidth
      className={SIDE_FIELD.root}
      value={value}
      onChange={onChange}
      type={type}
    >
      <Label className={SIDE_FIELD.label}>{label}</Label>
      {multiline ? (
        <TextArea
          id={id}
          rows={TEXTAREA_ROWS}
          variant="secondary"
          className={`resize-none ${SIDE_FIELD.control}`}
          {...placeholderProps}
        />
      ) : (
        <Input id={id} variant="secondary" className={SIDE_FIELD.control} {...placeholderProps} />
      )}
      <Description className={SIDE_FIELD.hint}>{hint}</Description>
    </HeroTextField>
  )
}
