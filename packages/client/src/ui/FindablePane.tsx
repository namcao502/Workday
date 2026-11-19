import { ChevronDown, ChevronUp, Xmark } from '@gravity-ui/icons'
import { Button, Input } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'
import { OverviewRuler, type OverviewMark } from './OverviewRuler.js'

// Line numbers and diff marks are not part of the text a search or a select-all means.
const SKIPPED = '.code-number, .diff-number, .diff-mark'
const MATCH_HIGHLIGHT = 'find-match'
const CURRENT_HIGHLIGHT = 'find-current'
const MUTATION_DELAY_MS = 100

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void
  delete: (name: string) => void
}
type HighlightConstructor = new (...ranges: Range[]) => unknown

// The CSS Custom Highlight API (Chromium, so Edge); absent in jsdom, where only the match count works.
function highlightApi(): { registry: HighlightRegistry; Highlight: HighlightConstructor } | null {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)
    ?.highlights
  const Highlight = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight
  return registry === undefined || Highlight === undefined ? null : { registry, Highlight }
}

function collectRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.toLowerCase()
  if (needle === '') {
    return []
  }
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement === null || node.parentElement.closest(SKIPPED) !== null) {
      continue
    }
    const text = (node.textContent ?? '').toLowerCase()
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      ranges.push(range)
    }
  }
  return ranges
}

function paint(ranges: readonly Range[], current: number): void {
  const api = highlightApi()
  if (api === null) {
    return
  }
  if (ranges.length === 0) {
    api.registry.delete(MATCH_HIGHLIGHT)
    api.registry.delete(CURRENT_HIGHLIGHT)
    return
  }
  api.registry.set(MATCH_HIGHLIGHT, new api.Highlight(...ranges))
  const active = ranges[current]
  if (active === undefined) {
    api.registry.delete(CURRENT_HIGHLIGHT)
  } else {
    api.registry.set(CURRENT_HIGHLIGHT, new api.Highlight(active))
  }
}

function clearPaint(): void {
  paint([], 0)
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    // The attribute too: jsdom has no isContentEditable.
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('[contenteditable]:not([contenteditable="false"])') !== null))
  )
}

interface Picked {
  readonly text: string
  readonly range: Range
}

// The text selected inside the pane, as a search: one line only, as an editor's find takes it.
function selectedIn(root: HTMLElement | null): Picked | null {
  const selection = window.getSelection()
  if (root === null || selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }
  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) {
    return null
  }
  const text = selection.toString().trim()
  return text === '' || text.includes('\n') ? null : { text, range: range.cloneRange() }
}

interface FindablePaneProps {
  readonly children: React.ReactNode
  readonly overview?: readonly OverviewMark[] | undefined
  readonly scrolls?: boolean // false when the content scrolls itself (the Teams thread keeps its newest message in view)
}

// A scrolling pane (a file or a diff) with Ctrl+A selecting only its text and Ctrl+F opening a find bar:
// every match highlighted, Enter / Shift+Enter step through them, Esc closes.
export function FindablePane({
  children,
  overview = [],
  scrolls = true,
}: FindablePaneProps): React.JSX.Element {
  const outer = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(0)
  const [count, setCount] = useState(0)
  const [version, setVersion] = useState(0)
  const ranges = useRef<readonly Range[]>([])
  const startAt = useRef<Range | null>(null) // a search taken from a selection starts at that match

  // Search again whenever the query or the shown text changes.
  useEffect(() => {
    const root = content.current
    if (!open || root === null) {
      ranges.current = []
      setCount(0)
      clearPaint()
      return undefined
    }
    ranges.current = collectRanges(root, query)
    setCount(ranges.current.length)
    const from = startAt.current
    startAt.current = null
    if (from === null) {
      setCurrent((index) => Math.min(index, Math.max(ranges.current.length - 1, 0)))
    } else {
      const at = ranges.current.findIndex(
        (range) => range.compareBoundaryPoints(Range.START_TO_START, from) >= 0,
      )
      setCurrent(Math.max(at, 0))
    }
    return clearPaint
  }, [open, query, version])

  // Paint and bring the current match into view.
  useEffect(() => {
    paint(ranges.current, current)
    const target = ranges.current[current]?.startContainer.parentElement
    if (target !== null && target !== undefined && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  }, [current, count, version, open])

  useEffect(() => {
    const root = content.current
    if (root === null) {
      return undefined
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setVersion((value) => value + 1)
      }, MUTATION_DELAY_MS)
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  // The keys work while focus is anywhere in the left pane (the tree, the viewer), not only in the text.
  useEffect(() => {
    const scope = outer.current?.closest('[data-testid="workspace-left"]') ?? outer.current ?? null
    function handleKey(event: KeyboardEvent): void {
      const key = event.key.toLowerCase()
      const find = (event.ctrlKey || event.metaKey) && key === 'f'
      // Text selected in the pane counts too: a mouse selection can leave focus outside it.
      const picked = find ? selectedIn(content.current) : null
      if (scope === null || (!scope.contains(document.activeElement) && picked === null)) {
        return
      }
      if (find) {
        event.preventDefault()
        if (picked !== null) {
          startAt.current = picked.range
          setQuery(picked.text)
          setVersion((value) => value + 1)
        }
        setOpen(true)
        input.current?.focus()
        input.current?.select()
      } else if ((event.ctrlKey || event.metaKey) && key === 'a' && !isEditable(event.target)) {
        event.preventDefault()
        if (content.current !== null) {
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(content.current)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      } else if (key === 'escape' && isEditable(event.target) && event.target === input.current) {
        setOpen(false)
        outer.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  function step(direction: 1 | -1): void {
    if (count !== 0) {
      setCurrent((index) => (index + direction + count) % count)
    }
  }

  return (
    <div ref={outer} tabIndex={-1} className="relative flex min-h-0 flex-1 flex-col outline-none">
      {open ? (
        <div className="absolute right-4 top-1 z-10 flex items-center gap-1 rounded-2xl bg-surface p-1 shadow-surface">
          <Input
            ref={input}
            autoFocus
            variant="secondary"
            aria-label={t('ui.findInThisFile')}
            placeholder={t('ui.find')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCurrent(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                step(event.shiftKey ? -1 : 1)
              }
            }}
          />
          <span className="min-w-12 text-center text-xs text-muted" role="status">
            {query === '' ? '' : `${String(count === 0 ? 0 : current + 1)}/${String(count)}`}
          </span>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={t('ui.previousMatch')}
            onPress={() => {
              step(-1)
            }}
          >
            <ChevronUp />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={t('ui.nextMatch')}
            onPress={() => {
              step(1)
            }}
          >
            <ChevronDown />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={t('ui.closeFind')}
            onPress={() => {
              setOpen(false)
            }}
          >
            <Xmark />
          </Button>
        </div>
      ) : null}
      <div
        ref={content}
        className={
          scrolls
            ? 'min-h-0 flex-1 overflow-auto pr-2 [scrollbar-gutter:stable]'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        {children}
      </div>
      {overview.length === 0 ? null : <OverviewRuler marks={overview} scroller={content} />}
    </div>
  )
}
