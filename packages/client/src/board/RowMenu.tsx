import type { BoardAction } from '@workday/core'
import { Button, Dropdown } from '@heroui/react'
import { EllipsisVertical } from '@gravity-ui/icons'
import { useAccess } from '../api/useMe.js'
import { t } from '../i18n.js'
import type { RowViewId } from './boardView.js'

// Start / Open need a configured workspace on the local PC; the Board passes it only then.
export interface RowWorkspace {
  readonly openKeys: ReadonlySet<string>
  readonly starting: ReadonlySet<string>
  readonly onStart: (ticketKey: string) => void
  readonly onOpen: (ticketKey: string) => void
}

interface RowMenuProps {
  readonly ticketKey: string
  readonly view: RowViewId
  readonly onAction: (action: BoardAction) => void
  readonly workspace?: RowWorkspace | undefined
  readonly onReadyToTest?: (() => void) | undefined // set when the ticket has steps left
}

interface MenuItem {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly run: () => void
}

function workspaceItems(ticketKey: string, workspace: RowWorkspace): readonly MenuItem[] {
  const starting = workspace.starting.has(ticketKey)
  const open: MenuItem = {
    id: 'open',
    label: t('board.open'),
    run: () => {
      workspace.onOpen(ticketKey)
    },
  }
  if (workspace.openKeys.has(ticketKey)) {
    return [open]
  }
  const start: MenuItem = {
    id: 'start',
    label: starting ? t('board.starting') : t('board.start'),
    disabled: starting,
    run: () => {
      workspace.onStart(ticketKey)
    },
  }
  return [start, open]
}

function itemsFor(props: RowMenuProps): readonly MenuItem[] {
  const { view, ticketKey, onAction, workspace, onReadyToTest } = props
  const action = (id: BoardAction, label: string): MenuItem => ({
    id,
    label,
    run: () => {
      onAction(id)
    },
  })
  const dismiss = action('dismiss', t('board.dismiss'))
  const readyToTest: readonly MenuItem[] =
    onReadyToTest === undefined
      ? []
      : [{ id: 'readyToTest', label: t('board.readyToTest'), run: onReadyToTest }]
  switch (view) {
    case 'working':
      return [
        ...(workspace === undefined ? [] : workspaceItems(ticketKey, workspace)),
        ...readyToTest,
        action('done', t('board.done2')),
        dismiss,
      ]
    case 'done':
      return [...readyToTest, action('reopen', t('board.reopen')), dismiss]
    case 'dismissed':
      return [action('restore', t('board.restore'))]
  }
}

export function RowMenu(props: RowMenuProps): React.JSX.Element | null {
  const { ticketKey } = props
  const canAct = useAccess().canAct('board')
  if (!canAct) {
    return null
  }
  return (
    <Dropdown>
      <Button
        isIconOnly
        variant="secondary"
        size="sm"
        aria-label={t('board.actionsFor', { ticketKey })}
      >
        <EllipsisVertical />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu>
          {itemsFor(props).map((item) => (
            <Dropdown.Item
              key={item.id}
              id={item.id}
              textValue={item.label}
              isDisabled={item.disabled === true}
              onAction={item.run}
            >
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
