import type { BoardAction } from '@workday/core'
import { useEffect, useRef, useState } from 'react'
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
    label: t('Open', 'Mở'),
    run: () => {
      workspace.onOpen(ticketKey)
    },
  }
  if (workspace.openKeys.has(ticketKey)) {
    return [open]
  }
  const start: MenuItem = {
    id: 'start',
    label: starting ? t('Starting...', 'Đang bắt đầu...') : t('Start', 'Bắt đầu'),
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
  const dismiss = action('dismiss', t('Dismiss', 'Bỏ qua'))
  const readyToTest: readonly MenuItem[] =
    onReadyToTest === undefined
      ? []
      : [{ id: 'readyToTest', label: t('Ready to Test', 'Ready to Test'), run: onReadyToTest }]
  switch (view) {
    case 'working':
      return [
        ...(workspace === undefined ? [] : workspaceItems(ticketKey, workspace)),
        ...readyToTest,
        action('done', t('Done', 'Hoàn thành')),
        dismiss,
      ]
    case 'done':
      return [...readyToTest, action('reopen', t('Reopen', 'Mở lại')), dismiss]
    case 'dismissed':
      return [action('restore', t('Restore', 'Khôi phục'))]
  }
}

export function RowMenu(props: RowMenuProps): React.JSX.Element | null {
  const { ticketKey } = props
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const canAct = useAccess().canAct('board')

  useEffect(() => {
    if (!open) {
      return undefined
    }
    function closeOnOutsideClick(event: MouseEvent): void {
      if (event.target instanceof Node && containerRef.current?.contains(event.target) !== true) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [open])

  if (!canAct) {
    return null
  }
  return (
    <div className="row-menu" ref={containerRef}>
      <button
        type="button"
        className="button ghost row-menu-trigger"
        aria-label={t(`Actions for ${ticketKey}`, `Thao tác cho ${ticketKey}`)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen)
        }}
      >
        ...
      </button>
      {open ? (
        <div className="menu" role="menu">
          {itemsFor(props).map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={item.disabled === true}
              onClick={() => {
                setOpen(false)
                item.run()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
