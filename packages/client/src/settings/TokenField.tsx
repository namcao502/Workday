import { Button, Chip, Description, Input, Label, TextField as HeroTextField } from '@heroui/react'
import { t } from '../i18n.js'
import { SIDE_FIELD } from '../ui/TextField.js'

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
  label = t('settings.jiraApiToken'),
  envText = t('settings.takenFromWorkdayJiraApiToken'),
  helpText = t('settings.createOneAtIdAtlassianCom'),
}: TokenFieldProps): React.JSX.Element {
  if (source === 'env') {
    return (
      <HeroTextField fullWidth isDisabled isReadOnly value={MASK} className={SIDE_FIELD.root}>
        <Label className={SIDE_FIELD.label}>{label}</Label>
        <Input id={id} variant="secondary" className={SIDE_FIELD.control} />
        <div className={SIDE_FIELD.hint}>
          <Chip size="sm">{envText}</Chip>
        </div>
      </HeroTextField>
    )
  }
  const showMask = source === 'file' && !replacing
  return (
    <HeroTextField
      fullWidth
      className={SIDE_FIELD.root}
      isDisabled={showMask}
      type={showMask ? 'text' : 'password'}
      value={showMask ? MASK : value}
      onChange={onChange}
    >
      <Label className={SIDE_FIELD.label}>{label}</Label>
      <div className={`flex items-center gap-2 ${SIDE_FIELD.control}`}>
        <Input id={id} variant="secondary" autoComplete="off" className="flex-1" />
        {showMask ? (
          <Button variant="secondary" size="sm" onPress={onReplace}>
            {t('settings.replace')}
          </Button>
        ) : null}
      </div>
      <Description className={SIDE_FIELD.hint}>{helpText}</Description>
    </HeroTextField>
  )
}
