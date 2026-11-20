import { useEffect, useState } from 'react'

// Mirrors TopBar's classes: the header's side padding (pl-4 pr-5), the grid gap (gap-3) and the box width
// (clamp(240px, 30vw, 440px)) from the width where the box opens.
const HEADER_PADDING_PX = 36
const GRID_GAP_PX = 12
export const SEARCH_BOX_MIN_WIDTH_PX = 900

const SCROLLING: ReadonlySet<string> = new Set(['auto', 'scroll'])

export function searchBoxWidth(viewportWidth: number): number {
  return Math.min(440, Math.max(240, viewportWidth * 0.3))
}

export interface ScrollStrip {
  readonly clientWidth: number // what the strip has now
  readonly minContentWidth: number // its items at their minimum width, with the gaps
}

export interface FoldInput {
  readonly headerWidth: number
  readonly viewportWidth: number
  readonly leftWidth: number // the title column as laid out now
  readonly strips: readonly ScrollStrip[] // scrolling strips the page put in the bar (Workspace tabs)
}

// True when a strip in the title column would not fit with the box in the middle: the box then folds to its
// magnifier at the right and the column takes the room. The same test runs folded or not, so it never flips.
export function foldsSearch(input: FoldInput): boolean {
  if (input.viewportWidth < SEARCH_BOX_MIN_WIDTH_PX) {
    return false
  }
  const contentWidth = input.headerWidth - HEADER_PADDING_PX
  const leftWhenCentered =
    (contentWidth - searchBoxWidth(input.viewportWidth) - 2 * GRID_GAP_PX) / 2
  const lost = input.leftWidth - leftWhenCentered
  return input.strips.some((strip) => strip.minContentWidth > strip.clientWidth - lost)
}

function minContentWidth(strip: HTMLElement): number {
  const children = [...strip.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  )
  const gap = parseFloat(getComputedStyle(strip).columnGap) || 0
  const items = children.reduce((sum, child) => {
    const min = parseFloat(getComputedStyle(child).minWidth)
    return sum + (min > 0 ? min : child.offsetWidth)
  }, 0)
  return items + gap * Math.max(0, children.length - 1)
}

function scrollStrips(slot: HTMLElement): ScrollStrip[] {
  return [...slot.querySelectorAll<HTMLElement>('*')]
    .filter((element) => SCROLLING.has(getComputedStyle(element).overflowX))
    .map((element) => ({
      clientWidth: element.clientWidth,
      minContentWidth: minContentWidth(element),
    }))
}

// Watches the bar and the page's slot, and says whether the search box should fold.
export function useSearchFolded(header: HTMLElement | null, slot: HTMLElement | null): boolean {
  const [folded, setFolded] = useState(false)
  useEffect(() => {
    if (header === null || slot === null || slot.parentElement === null) {
      return undefined
    }
    const left = slot.parentElement
    const measure = (): void => {
      setFolded(
        foldsSearch({
          headerWidth: header.clientWidth,
          viewportWidth: window.innerWidth,
          leftWidth: left.clientWidth,
          strips: scrollStrips(slot),
        }),
      )
    }
    measure()
    // jsdom has no ResizeObserver; the one measure above is all a test needs.
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const resize = new ResizeObserver(measure)
    resize.observe(header)
    resize.observe(left)
    const mutation = new MutationObserver(measure)
    mutation.observe(slot, { childList: true, subtree: true })
    return () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [header, slot])
  return folded
}
