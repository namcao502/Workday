import { Bars } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { t } from '../i18n.js'
import { NoticeBell } from '../notices/NoticeBell.js'

interface TopBarProps {
  readonly onToggleMenu?: (() => void) | undefined // absent while the tab bar replaces the sidebar
  readonly slotRef: (element: HTMLDivElement | null) => void // where the page puts its title and actions
}

export function TopBar({ onToggleMenu, slotRef }: TopBarProps): React.JSX.Element {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-4">
      {onToggleMenu === undefined ? null : (
        <Button
          isIconOnly
          variant="secondary"
          aria-label={t('Collapse or expand the menu', 'Thu gọn / mở rộng menu')}
          onPress={onToggleMenu}
        >
          <Bars width={18} height={18} aria-hidden="true" />
        </Button>
      )}
      <div ref={slotRef} className="flex min-w-0 flex-1 items-center justify-between gap-3" />
      <NoticeBell />
    </header>
  )
}
