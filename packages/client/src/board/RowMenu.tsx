import type { BoardAction } from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { t } from '../i18n.js'
import type { BoardViewId } from './boardView.js'

interface RowMenuProps {
  readonly ticketKey: string
  readonly view: BoardViewId
  readonly onAction: (action: BoardAction) => void
}

interface MenuItem {
  readonly action: BoardAction
  readonly label: string
}

function itemsFor(view: BoardViewId): readonly MenuItem[] {
  const dismiss: MenuItem = { action: 'dismiss', label: t('Dismiss', 'Bỏ qua') }
  switch (view) {
    case 'working':
      return [{ action: 'done', label: t('Done', 'Hoàn thành') }, dismiss]
    case 'done':
      return [{ action: 'reopen', label: t('Reopen', 'Mở lại') }, dismiss]
    case 'dismissed':
      return [{ action: 'restore', label: t('Restore', 'Khôi phục') }]
  }
}

export function RowMenu({ ticketKey, view, onAction }: RowMenuProps): React.JSX.Element | null {
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
          {itemsFor(view).map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                onAction(item.action)
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
