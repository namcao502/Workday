import { useEffect, useRef, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="row-menu" ref={containerRef}>
      <button
        type="button"
        className="wd-button secondary menu-trigger"
        aria-label={t('More actions', 'Thêm thao tác')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen)
        }}
      >
        ...
      </button>
      {open ? (
        <div className="wd-menu" role="menu">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className="wd-menu-item"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false)
                action.onSelect()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
