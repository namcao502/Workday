import { ListBox, Select } from '@heroui/react'
import type { AgentMode } from '@workday/core'
import { t } from '../i18n.js'

function modeChoices(): readonly { readonly mode: AgentMode; readonly label: string }[] {
  return [
    { mode: 'default', label: t('Default', 'Mặc định') },
    { mode: 'acceptEdits', label: t('Accept edits', 'Tự nhận chỉnh sửa') },
    { mode: 'plan', label: t('Plan', 'Lập kế hoạch') },
    { mode: 'bypassPermissions', label: t('Bypass permissions', 'Bỏ qua quyền') },
  ]
}

interface ModeSelectProps {
  readonly label: string // the aria-label
  readonly value: AgentMode
  readonly onChange: (mode: AgentMode) => void
  readonly className?: string
}

// The four permission modes as a Select, shared by the chat header and the settings.
export function ModeSelect({
  label,
  value,
  onChange,
  className = 'w-48',
}: ModeSelectProps): React.JSX.Element {
  const choices = modeChoices()
  return (
    <Select
      aria-label={label}
      variant="secondary"
      className={className}
      value={value}
      onChange={(key) => {
        const choice = choices.find((item) => item.mode === key)
        if (choice !== undefined) {
          onChange(choice.mode)
        }
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {choices.map((choice) => (
            <ListBox.Item key={choice.mode} id={choice.mode} textValue={choice.label}>
              {choice.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}
