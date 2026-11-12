import type { JiraTokenSource } from '@workday/core'
import { t } from '../i18n.js'

const MASK = '•'.repeat(8)

interface TokenFieldProps {
  readonly source: JiraTokenSource
  readonly replacing: boolean
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onReplace: () => void
}

export function TokenField({
  source,
  replacing,
  value,
  onChange,
  onReplace,
}: TokenFieldProps): React.JSX.Element {
  const label = t('Jira API token', 'Jira API token')
  if (source === 'env') {
    return (
      <div className="form-field">
        <label className="field-label" htmlFor="jira-api-token">
          {label}
        </label>
        <input
          id="jira-api-token"
          className="input"
          value={MASK}
          aria-describedby="jira-api-token-hint"
          disabled
          readOnly
        />
        <span id="jira-api-token-hint" className="field-hint">
          {t(
            'Taken from WORKDAY_JIRA_API_TOKEN in .env - nothing to enter',
            'Lấy từ WORKDAY_JIRA_API_TOKEN trong .env - không cần nhập',
          )}
        </span>
      </div>
    )
  }
  const showMask = source === 'file' && !replacing
  return (
    <div className="form-field">
      <label className="field-label" htmlFor="jira-api-token">
        {label}
      </label>
      <div className="inline-row">
        <input
          id="jira-api-token"
          className="input"
          type={showMask ? 'text' : 'password'}
          autoComplete="off"
          aria-describedby="jira-api-token-hint"
          disabled={showMask}
          value={showMask ? MASK : value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
        {showMask ? (
          <button type="button" className="button secondary" onClick={onReplace}>
            {t('Replace', 'Thay thế')}
          </button>
        ) : null}
      </div>
      <span id="jira-api-token-hint" className="field-hint">
        {t(
          'Create one at id.atlassian.com > Security > API tokens. It is not your password.',
          'Tạo tại id.atlassian.com > Security > API tokens. Đây không phải mật khẩu.',
        )}
      </span>
    </div>
  )
}
