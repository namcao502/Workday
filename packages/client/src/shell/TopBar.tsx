import { Bars, Magnifier } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
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

// A search box in the middle of the bar, like VS Code's; on a small screen it folds to the magnifier alone.
function SearchBox(): React.JSX.Element {
  return (
    <Button
      variant="secondary"
      aria-label={t('palette.open')}
      className="palette-search w-9 justify-start gap-2 px-0 max-[899px]:justify-center min-[900px]:w-[clamp(240px,30vw,440px)] min-[900px]:px-3"
      onPress={() => {
        setPaletteOpen(true)
      }}
    >
      <Magnifier width={18} height={18} aria-hidden="true" className="flex-none" />
      <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-normal text-muted min-[900px]:inline">
        {t('palette.searchBox')}
      </span>
      <kbd className="hidden text-xs text-muted min-[900px]:inline">{shortcutHint()}</kbd>
      {/* palette-highlight: the season's picture inside the box, like Windows search (season.css). */}
      <span className="palette-highlight hidden" aria-hidden="true" />
    </Button>
  )
}

export function TopBar({ onToggleMenu, slotRef }: TopBarProps): React.JSX.Element {
  const titlebarClass = isDesktopShell() ? ' app-titlebar' : ''
  return (
    <header
      className={`app-topbar${titlebarClass} relative grid h-14 shrink-0 grid-cols-[1fr_auto_auto] items-center gap-3 pl-4 pr-5 min-[900px]:grid-cols-[1fr_auto_1fr]`}
    >
      <div className="flex min-w-0 items-center gap-3">
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
      </div>
      <SearchBox />
      <div className="flex items-center justify-end gap-3">
        <ConnectionStatus />
        <NoticeBell />
        <WindowControls />
      </div>
    </header>
  )
}
