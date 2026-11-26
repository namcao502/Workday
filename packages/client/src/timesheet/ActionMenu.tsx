import { Button, Dropdown } from '@heroui/react'
import { EllipsisVertical } from '@gravity-ui/icons'
import { t } from '../i18n.js'

export interface MenuAction {
  readonly label: string
  readonly disabled: boolean
  readonly onSelect: () => void
}

export function ActionMenu({
  actions,
  label = t('timesheet.moreActions'),
  size,
}: {
  readonly actions: readonly MenuAction[]
  readonly label?: string
  readonly size?: 'sm'
}): React.JSX.Element {
  return (
    <Dropdown>
      <Button isIconOnly size={size} variant="secondary" aria-label={label}>
        <EllipsisVertical />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu>
          {actions.map((action) => (
            <Dropdown.Item
              key={action.label}
              id={action.label}
              textValue={action.label}
              isDisabled={action.disabled}
              onAction={action.onSelect}
            >
              {action.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
