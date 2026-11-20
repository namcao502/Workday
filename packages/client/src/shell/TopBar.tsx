import { Bars, Magnifier } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useCallback, useState } from 'react'
import { t } from '../i18n.js'
import { NoticeBell } from '../notices/NoticeBell.js'
import { ConnectionStatus } from './ConnectionStatus.js'
import { isDesktopShell } from './desktopHost.js'
import { setPaletteOpen } from './palette.js'
import { useSearchFolded } from './searchFold.js'
import { WindowControls } from './WindowControls.js'

interface TopBarProps {
  readonly onToggleMenu?: (() => void) | undefined // absent while the tab bar replaces the sidebar
  readonly slotRef: (element: HTMLDivElement | null) => void // where the page puts its title and actions
}

// Cmd on macOS, Ctrl elsewhere.
function shortcutHint(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Cmd K' : 'Ctrl K'
}

// Wide: the box with its label. Folded (small screen, or a crowded title column): the magnifier alone.
const BOX_CLASS =
  'w-9 justify-start gap-2 px-0 max-[899px]:justify-center min-[900px]:w-[clamp(240px,30vw,440px)] min-[900px]:px-3'
const FOLDED_CLASS = 'w-9 justify-center px-0'
const WIDE_ONLY = 'hidden min-[900px]:inline'

// A search box in the middle of the bar, like VS Code's.
function SearchBox({ folded }: { readonly folded: boolean }): React.JSX.Element {
  const wideOnly = folded ? 'hidden' : WIDE_ONLY
  return (
    <Button
      variant="secondary"
      aria-label={t('palette.open')}
      className={`palette-search ${folded ? FOLDED_CLASS : BOX_CLASS}`}
      onPress={() => {
        setPaletteOpen(true)
      }}
    >
      <Magnifier width={18} height={18} aria-hidden="true" className="flex-none" />
      <span
        className={`${wideOnly} min-w-0 flex-1 truncate text-left text-sm font-normal text-muted`}
      >
        {t('palette.searchBox')}
      </span>
      <kbd className={`${wideOnly} text-xs text-muted`}>{shortcutHint()}</kbd>
      {/* palette-highlight: the season's picture inside the box, like Windows search (season.css). */}
      {folded ? null : <span className="palette-highlight hidden" aria-hidden="true" />}
    </Button>
  )
}

export function TopBar({ onToggleMenu, slotRef }: TopBarProps): React.JSX.Element {
  const titlebarClass = isDesktopShell() ? ' app-titlebar' : ''
  const [header, setHeader] = useState<HTMLElement | null>(null)
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const folded = useSearchFolded(header, slot)
  const columns = folded
    ? 'grid-cols-[minmax(0,1fr)_auto_auto]'
    : 'grid-cols-[minmax(0,1fr)_auto_auto] min-[900px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
  const setSlotRef = useCallback(
    (element: HTMLDivElement | null) => {
      setSlot(element)
      slotRef(element)
    },
    [slotRef],
  )
  return (
    <header
      ref={setHeader}
      className={`app-topbar${titlebarClass} relative grid h-14 shrink-0 ${columns} items-center gap-3 pl-4 pr-5`}
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
        <div ref={setSlotRef} className="flex min-w-0 flex-1 items-center justify-between gap-3" />
      </div>
      <SearchBox folded={folded} />
      <div className="flex items-center justify-end gap-3">
        <ConnectionStatus />
        <NoticeBell />
        <WindowControls />
      </div>
    </header>
  )
}
