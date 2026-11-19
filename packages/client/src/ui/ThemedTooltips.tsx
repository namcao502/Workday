import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SHOW_DELAY_MS = 500
const GAP_PX = 6
const EDGE_PX = 8
const TIP_SELECTOR = '[title], [data-tip]'

interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly bottom: number
}

interface Size {
  readonly width: number
  readonly height: number
}

// Centered under the element, above it when the window has no room below, never past a side edge.
export function tipPosition(
  anchor: Box,
  tip: Size,
  viewport: Size,
): { readonly left: number; readonly top: number } {
  const centered = anchor.left + anchor.width / 2 - tip.width / 2
  const left = Math.min(Math.max(centered, EDGE_PX), viewport.width - tip.width - EDGE_PX)
  const below = anchor.bottom + GAP_PX
  const fitsBelow = below + tip.height <= viewport.height - EDGE_PX
  return { left, top: fitsBelow ? below : anchor.top - GAP_PX - tip.height }
}

// Moves a title to data-tip so the browser's own tip never shows. The text stays with the element: as its
// name when it has no other (an icon button), otherwise as its description.
function takeTitle(element: Element): string | null {
  const title = element.getAttribute('title')
  if (title !== null && title !== '') {
    element.removeAttribute('title')
    element.setAttribute('data-tip', title)
    const named = element.hasAttribute('aria-label') || element.textContent.trim() !== ''
    element.setAttribute(named ? 'aria-description' : 'aria-label', title)
  }
  return element.getAttribute('data-tip')
}

// Every title in a subtree, the root included.
function takeTitles(root: Element): void {
  if (root.hasAttribute('title')) {
    takeTitle(root)
  }
  for (const element of root.querySelectorAll('[title]')) {
    takeTitle(element)
  }
}

interface Shown {
  readonly text: string
  readonly anchor: Box
}

// Every title in the app shows in the theme's overlay style (the HeroUI tooltip look) instead of the browser's.
export function ThemedTooltips(): React.JSX.Element | null {
  const [shown, setShown] = useState<Shown | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current: Element | null = null
    let timer: number | undefined

    function hide(): void {
      window.clearTimeout(timer)
      current = null
      setShown(null)
      setPosition(null)
    }

    function show(element: Element): void {
      const text = takeTitle(element)
      if (text !== null && text !== '' && element.isConnected) {
        setShown({ text, anchor: element.getBoundingClientRect() })
      }
    }

    function onOver(event: PointerEvent | FocusEvent): void {
      const element = event.target instanceof Element ? event.target.closest(TIP_SELECTOR) : null
      if (element === null || element === current) {
        return
      }
      hide()
      current = element
      takeTitle(element)
      if (event.type === 'focusin') {
        if (element.matches(':focus-visible')) {
          show(element)
        }
        return
      }
      timer = window.setTimeout(() => {
        show(element)
      }, SHOW_DELAY_MS)
    }

    function onOut(event: PointerEvent | FocusEvent): void {
      const next = event.relatedTarget
      if (current !== null && !(next instanceof Node && current.contains(next))) {
        hide()
      }
    }

    // Titles move as soon as they appear, never under the pointer: Edge has started its own tip for a title the
    // pointer is on, and taking it away then made an installed app's window raise Edge's other windows.
    takeTitles(document.body)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          takeTitles(record.target)
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            takeTitles(node)
          }
        }
      }
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title'],
    })

    document.addEventListener('pointerover', onOver)
    document.addEventListener('focusin', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusout', onOut)
    document.addEventListener('pointerdown', hide)
    document.addEventListener('keydown', hide)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('focusin', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusout', onOut)
      document.removeEventListener('pointerdown', hide)
      document.removeEventListener('keydown', hide)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Measured once rendered, then placed; hidden until then so it never flashes at the corner.
  useLayoutEffect(() => {
    const tip = tipRef.current
    if (shown === null || tip === null) {
      return
    }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    setPosition(tipPosition(shown.anchor, tip.getBoundingClientRect(), viewport))
  }, [shown])

  if (shown === null) {
    return null
  }
  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      className="themed-tooltip pointer-events-none fixed z-[100] max-w-xs whitespace-pre-line"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position === null ? 'hidden' : 'visible',
      }}
    >
      {shown.text}
    </div>,
    document.body,
  )
}
