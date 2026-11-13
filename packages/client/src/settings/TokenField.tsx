import { Button, Chip, Description, Input, Label, TextField as HeroTextField } from '@heroui/react'
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
  if (source === 'env') {
    return (
      <HeroTextField fullWidth isDisabled isReadOnly value={MASK}>
        <Label>{label}</Label>
        <Input id={id} variant="secondary" />
        <div>
          <Chip size="sm">{envText}</Chip>
        </div>
      </HeroTextField>
    )
  }
  const showMask = source === 'file' && !replacing
  return (
    <HeroTextField
      fullWidth
      isDisabled={showMask}
      type={showMask ? 'text' : 'password'}
      value={showMask ? MASK : value}
      onChange={onChange}
    >
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} variant="secondary" autoComplete="off" className="flex-1" />
        {showMask ? (
          <Button variant="secondary" size="sm" onPress={onReplace}>
            {t('Replace', 'Thay thế')}
          </Button>
        ) : null}
      </div>
      <Description>{helpText}</Description>
    </HeroTextField>
  )
}
