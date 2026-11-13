import { t } from '../i18n.js'

const MASK = '•'.repeat(8)

interface TokenFieldProps {
  readonly source: 'env' | 'file' | null
  readonly replacing: boolean
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onReplace: () => void
  // Defaults describe the Jira token; the HRM key passes its own.
  readonly id?: string
  readonly label?: string
  readonly envText?: string
  readonly helpText?: string
}

export function TokenField({
  source,
  replacing,
  value,
  onChange,
  onReplace,
  id = 'jira-api-token',
  label = t('Jira API token', 'Jira API token'),
  envText = t(
    'Taken from WORKDAY_JIRA_API_TOKEN in .env - nothing to enter',
    'Lấy từ WORKDAY_JIRA_API_TOKEN trong .env - không cần nhập',
  ),
  helpText = t(
    'Create one at id.atlassian.com > Security > API tokens. It is not your password.',
    'Tạo tại id.atlassian.com > Security > API tokens. Đây không phải mật khẩu.',
  ),
}: TokenFieldProps): React.JSX.Element {
  const hintId = `${id}-hint`
  if (source === 'env') {
    return (
      <div className="form-field">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className="wd-input"
          value={MASK}
          aria-describedby={hintId}
          disabled
          readOnly
        />
        <span id={hintId} className="field-hint">
          {envText}
        </span>
      </div>
    )
  }
  const showMask = source === 'file' && !replacing
  return (
    <div className="form-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="inline-row">
        <input
          id={id}
          className="wd-input"
          type={showMask ? 'text' : 'password'}
          autoComplete="off"
          aria-describedby={hintId}
          disabled={showMask}
          value={showMask ? MASK : value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
        {showMask ? (
          <button type="button" className="wd-button secondary" onClick={onReplace}>
            {t('Replace', 'Thay thế')}
          </button>
        ) : null}
      </div>
      <span id={hintId} className="field-hint">
        {helpText}
      </span>
    </div>
  )
}
