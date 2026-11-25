import { useEffect } from 'react'

const ATTRIBUTE = 'data-scrollon'
const HIDE_AFTER_MS = 1000

// The nearest ancestor that actually scrolls, so the bar shows on the element the pointer or wheel acts on.
function scrollableAncestor(target: EventTarget | null): HTMLElement | null {
  let element = target instanceof HTMLElement ? target : null
  while (element !== null) {
    const style = getComputedStyle(element)
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      element.scrollHeight > element.clientHeight
    ) {
      return element
    }
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      element.scrollWidth > element.clientWidth
    ) {
      return element
    }
    element = element.parentElement
  }
  return null
}

// Shows a scroll container's bar only while the pointer is over it or it is actively scrolling, then hides
// it again. Sets a data attribute (not a class) so React does not strip it on the next render.
export function useAutoHideScrollbars(): void {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) {
      return
    }
    let hovered: HTMLElement | null = null
    const hideTimers = new WeakMap<HTMLElement, number>()

    const onPointerOver = (event: PointerEvent): void => {
      const next = scrollableAncestor(event.target)
      if (next === hovered) {
        return
      }
      // Leave a bar that is mid-scroll to its own timer; otherwise hide the one we are leaving at once.
      if (hovered !== null && hideTimers.get(hovered) === undefined) {
        hovered.removeAttribute(ATTRIBUTE)
      }
      hovered = next
      if (hovered !== null) {
        hovered.setAttribute(ATTRIBUTE, '')
      }
    }

    const onScroll = (event: Event): void => {
      const element = event.target instanceof HTMLElement ? event.target : null
      if (element === null) {
        return
      }
      element.setAttribute(ATTRIBUTE, '')
      const previous = hideTimers.get(element)
      if (previous !== undefined) {
        clearTimeout(previous)
      }
      hideTimers.set(
        element,
        window.setTimeout(() => {
          hideTimers.delete(element)
          if (element !== hovered) {
            element.removeAttribute(ATTRIBUTE)
          }
        }, HIDE_AFTER_MS),
      )
    }

    document.addEventListener('pointerover', onPointerOver, { passive: true })
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [])
}
