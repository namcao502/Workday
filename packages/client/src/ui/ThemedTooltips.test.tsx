import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemedTooltips, tipPosition } from './ThemedTooltips.js'

describe('tipPosition', () => {
  const viewport = { width: 1000, height: 800 }
  const tip = { width: 120, height: 30 }

  it('sits centered below the element', () => {
    const anchor = { left: 400, top: 100, width: 40, height: 20, bottom: 120 }
    expect(tipPosition(anchor, tip, viewport)).toEqual({ left: 360, top: 126 })
  })

  it('goes above when there is no room below, and stays inside the window sideways', () => {
    const anchor = { left: 980, top: 760, width: 20, height: 30, bottom: 790 }
    expect(tipPosition(anchor, tip, viewport)).toEqual({ left: 872, top: 724 })
  })
})

describe('ThemedTooltips', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function hover(element: Element): void {
    fireEvent.pointerOver(element)
    act(() => {
      vi.advanceTimersByTime(600)
    })
  }

  it('shows a title in the themed tip instead of the browser one', () => {
    render(
      <>
        <ThemedTooltips />
        <button type="button" title="Copy the key">
          Copy
        </button>
      </>,
    )
    const button = screen.getByRole('button', { name: 'Copy' })
    hover(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Copy the key')
    // The browser tip is gone; the text stays with the element.
    expect(button).not.toHaveAttribute('title')
    expect(button).toHaveAttribute('data-tip', 'Copy the key')
    expect(button).toHaveAccessibleDescription('Copy the key')
  })

  it('moves every title as soon as it appears, before the pointer gets there', async () => {
    const { rerender } = render(
      <>
        <ThemedTooltips />
        <span title="First">one</span>
      </>,
    )
    // Edge starts its own tip for a title under the pointer; taking that title away then upset its windows.
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('one')).not.toHaveAttribute('title')
    expect(screen.getByText('one')).toHaveAttribute('data-tip', 'First')
    rerender(
      <>
        <ThemedTooltips />
        <span title="First">one</span>
        <span title="Added later">two</span>
      </>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('two')).toHaveAttribute('data-tip', 'Added later')
    expect(screen.getByText('two')).toHaveAccessibleDescription('Added later')
  })

  it('an icon-only element keeps its name when the title moves', () => {
    render(
      <>
        <ThemedTooltips />
        <button type="button" title="Close">
          <svg aria-hidden="true" />
        </button>
      </>,
    )
    hover(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-label', 'Close')
  })

  it('hides when the pointer leaves or presses, and keeps line breaks', () => {
    render(
      <>
        <ThemedTooltips />
        <span title={'2 session(s) waiting\nOpen the workspace'}>badge</span>
        <span>elsewhere</span>
      </>,
    )
    const badge = screen.getByText('badge')
    hover(badge)
    expect(screen.getByRole('tooltip')).toHaveClass('whitespace-pre-line')
    fireEvent.pointerOut(badge, { relatedTarget: screen.getByText('elsewhere') })
    expect(screen.queryByRole('tooltip')).toBeNull()
    hover(badge)
    fireEvent.pointerDown(badge)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('a quick pass over an element shows nothing', () => {
    render(
      <>
        <ThemedTooltips />
        <span title="Tip">item</span>
        <span>elsewhere</span>
      </>,
    )
    const item = screen.getByText('item')
    fireEvent.pointerOver(item)
    fireEvent.pointerOut(item, { relatedTarget: screen.getByText('elsewhere') })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
