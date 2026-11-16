import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SplitView } from './SplitView.js'
import { useStoredSplit, validShare } from './useStoredSplit.js'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function panes(hidden: 'none' | 'left' | 'right', onShareChange = vi.fn()) {
  return render(
    <SplitView
      share={0.5}
      onShareChange={onShareChange}
      hidden={hidden}
      minPx={100}
      left={<p>left pane</p>}
      right={<p>right pane</p>}
    />,
  )
}

it('the handle is a button that nudges the share with the arrow keys and resets on double-click', () => {
  const onShareChange = vi.fn()
  panes('none', onShareChange)
  const handle = screen.getByRole('button', { name: 'Resize the panes' })
  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect(onShareChange).toHaveBeenLastCalledWith(expect.closeTo(0.52, 5))
  fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  expect(onShareChange).toHaveBeenLastCalledWith(expect.closeTo(0.48, 5))
  fireEvent.doubleClick(handle)
  expect(onShareChange).toHaveBeenLastCalledWith(null)
})

it('a hidden pane leaves no handle and the other pane keeps showing', () => {
  panes('left')
  expect(screen.queryByRole('button', { name: 'Resize the panes' })).not.toBeInTheDocument()
  expect(screen.getByText('right pane')).toBeVisible()
})

it('validShare drops values outside 0.1 to 0.9', () => {
  expect(validShare(0.5)).toBe(0.5)
  expect(validShare(0.05)).toBeNull()
  expect(validShare('0.5')).toBeNull()
})

function Probe({ id }: { readonly id: string }): React.JSX.Element {
  const split = useStoredSplit(id)
  return (
    <button
      type="button"
      onClick={() => {
        split.setHidden('left')
      }}
    >
      {`${id}:${split.hidden}`}
    </button>
  )
}

it('useStoredSplit keeps the hidden pane per key', () => {
  const { rerender } = render(<Probe id="MDP-1" />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('button')).toHaveTextContent('MDP-1:left')
  rerender(<Probe id="MDP-2" />)
  expect(screen.getByRole('button')).toHaveTextContent('MDP-2:none')
  rerender(<Probe id="MDP-1" />)
  expect(screen.getByRole('button')).toHaveTextContent('MDP-1:left')
})
