import { Bars, Magnifier } from '@gravity-ui/icons'
import { Button, Tooltip } from '@heroui/react'
import { t } from '../i18n.js'
import { NoticeBell } from '../notices/NoticeBell.js'
import { ConnectionStatus } from './ConnectionStatus.js'
import { isDesktopShell } from './desktopHost.js'
import { setPaletteOpen } from './palette.js'
import { WindowControls } from './WindowControls.js'

interface TopBarProps {
  readonly onToggleMenu?: (() => void) | undefined // absent while the tab bar replaces the sidebar
  readonly slotRef: (element: HTMLDivElement | null) => void // where the page puts its title and actions
}

// Cmd on macOS, Ctrl elsewhere.
function shortcutHint(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Cmd K' : 'Ctrl K'
}

export function TopBar({ onToggleMenu, slotRef }: TopBarProps): React.JSX.Element {
  const titlebarClass = isDesktopShell() ? ' app-titlebar' : ''
  return (
    <header
      className={`app-topbar${titlebarClass} relative flex h-14 shrink-0 items-center gap-3 pl-4 pr-5`}
    >
      {onToggleMenu === undefined ? null : (
        <Button
          isIconOnly
          variant="secondary"
          aria-label={t('shell.collapseOrExpandTheMenu')}
          onPress={onToggleMenu}
        >
          <Bars width={18} height={18} aria-hidden="true" />
        </Button>
      )}
      <div ref={slotRef} className="flex min-w-0 flex-1 items-center justify-between gap-3" />
      <ConnectionStatus />
      {/* The Button takes the tooltip's trigger context itself; Tip's trigger span would leave it no hover. */}
      <Tooltip delay={500} closeDelay={0}>
        {/* palette-button: a season dresses it like the bell (season.css). */}
        <span className="palette-button relative inline-flex">
          <Button
            isIconOnly
            variant="secondary"
            aria-label={t('palette.open')}
            onPress={() => {
              setPaletteOpen(true)
            }}
          >
            <Magnifier width={20} height={20} aria-hidden="true" />
          </Button>
        </span>
        <Tooltip.Content placement="bottom">
          {t('palette.open')} ({shortcutHint()})
        </Tooltip.Content>
      </Tooltip>
      <NoticeBell />
      <WindowControls />
    </header>
  )
}
