import { ArrowUpRightFromSquare, Magnifier } from '@gravity-ui/icons'
import { Modal } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getBoard, queryKeys } from '../api/client.js'
import { useSettings } from '../api/useSettings.js'
import { useWorkspace } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { PageIcon } from './pageIcons.js'
import {
  buildItems,
  SECTION_ORDER,
  sectionTitle,
  type PaletteItem,
  type PaletteSource,
} from './paletteItems.js'
import { setPaletteOpen, togglePalette, usePaletteOpen } from './palette.js'
import { useSession } from './session.js'

const LISTBOX_ID = 'command-palette-list'

const optionId = (item: PaletteItem): string => `palette-${item.id}`

function PaletteRow({
  item,
  selected,
  onHover,
  onRun,
}: {
  readonly item: PaletteItem
  readonly selected: boolean
  readonly onHover: () => void
  readonly onRun: (item: PaletteItem, alt: boolean) => void
}): React.JSX.Element {
  return (
    <div
      id={optionId(item)}
      role="option"
      aria-selected={selected}
      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${selected ? 'bg-default' : ''}`}
      onMouseMove={onHover}
      onClick={() => {
        onRun(item, false)
      }}
    >
      {item.page === null ? null : <PageIcon page={item.page} className="size-4 shrink-0" />}
      <span className="shrink-0 text-sm font-medium">{item.label}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{item.detail}</span>
      {item.jiraUrl === null ? null : (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('palette.openInJira', { ticketKey: item.label })}
          className="cursor-pointer rounded-md p-1 text-muted hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onRun(item, true)
          }}
        >
          <ArrowUpRightFromSquare className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function openInJira(url: string): void {
  window.open(url, '_blank', 'noopener')
}

function PaletteBody({ source }: { readonly source: PaletteSource }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const items = useMemo(() => buildItems(source, query), [source, query])
  const active = items[Math.min(highlight, items.length - 1)]

  useEffect(() => {
    const element = active === undefined ? null : document.getElementById(optionId(active))
    if (element !== null && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  function run(item: PaletteItem, alt: boolean): void {
    setPaletteOpen(false)
    if (alt && item.jiraUrl !== null) {
      openInJira(item.jiraUrl)
    } else {
      item.run()
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlight(
        (current) => (Math.min(current, items.length - 1) + step + items.length) % items.length,
      )
    } else if (event.key === 'Enter' && active !== undefined) {
      event.preventDefault()
      run(active, event.altKey)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-separator px-4 py-3">
        <Magnifier className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={LISTBOX_ID}
          aria-activedescendant={active === undefined ? undefined : optionId(active)}
          aria-label={t('palette.placeholder')}
          placeholder={t('palette.placeholder')}
          className="min-w-0 flex-1 bg-transparent outline-none"
          value={query}
          onChange={(event) => {
            setHighlight(0)
            setQuery(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div id={LISTBOX_ID} role="listbox" className="h-[min(50vh,420px)] overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="p-3 text-sm text-muted">{t('palette.noMatches')}</p>
        ) : null}
        {SECTION_ORDER.map((section) => {
          const rows = items.filter((item) => item.section === section)
          return rows.length === 0 ? null : (
            <div key={section} role="group" aria-label={sectionTitle(section)}>
              <p className="px-3 pb-1 pt-2 text-xs uppercase text-muted" aria-hidden="true">
                {sectionTitle(section)}
              </p>
              {rows.map((item) => (
                <PaletteRow
                  key={item.id}
                  item={item}
                  selected={item === active}
                  onHover={() => {
                    setHighlight(items.indexOf(item))
                  }}
                  onRun={run}
                />
              ))}
            </div>
          )
        })}
      </div>
      <p className="border-t border-separator px-4 py-2 text-xs text-muted">{t('palette.hint')}</p>
    </>
  )
}

// Ctrl+K (Cmd+K on macOS) toggles it; the board is read only while it is open.
export function CommandPalette(): React.JSX.Element | null {
  const open = usePaletteOpen()
  const session = useSession()
  const board = useQuery({ queryKey: queryKeys.board, queryFn: getBoard, enabled: open })
  const workspace = useWorkspace().data
  const jiraBaseUrl = useSettings().data?.config.jira?.baseUrl ?? null
  const sessionOk = useRef(session === 'ok')
  sessionOk.current = session === 'ok'

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isK = event.key.toLowerCase() === 'k'
      if (isK && (event.ctrlKey || event.metaKey) && !event.altKey && sessionOk.current) {
        event.preventDefault()
        togglePalette()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const rows = board.data?.rows
  const source = useMemo(
    () => ({ rows: rows ?? [], workspace, jiraBaseUrl }),
    [rows, workspace, jiraBaseUrl],
  )
  if (session !== 'ok') {
    return null
  }
  return (
    <Modal.Backdrop
      className="command-palette-backdrop"
      isOpen={open}
      onOpenChange={setPaletteOpen}
    >
      <Modal.Container placement="center">
        <Modal.Dialog
          aria-label={t('palette.open')}
          className="command-palette w-full max-w-[640px] p-0"
        >
          <PaletteBody source={source} />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
