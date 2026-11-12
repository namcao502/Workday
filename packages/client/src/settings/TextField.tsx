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
  const hintId = `${id}-hint`
  return (
    <div className="form-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {rows === undefined ? (
        <input
          id={id}
          className="input"
          type={type}
          value={value}
          placeholder={placeholder}
          aria-describedby={hintId}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      ) : (
        <textarea
          id={id}
          className="input"
          rows={rows}
          value={value}
          placeholder={placeholder}
          aria-describedby={hintId}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}
      <span id={hintId} className="field-hint">
        {hint}
      </span>
    </div>
  )
}
