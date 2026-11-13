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
}: {
  readonly actions: readonly MenuAction[]
}): React.JSX.Element {
  return (
    <Dropdown>
      <Button isIconOnly variant="secondary" aria-label={t('More actions', 'Thêm thao tác')}>
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
