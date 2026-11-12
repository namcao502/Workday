import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { HoursBar } from './HoursBar.js'

function moveTo(clientX: number): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX }))
  })
}

function release(): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup'))
  })
}

function setup(onCommit: (minutes: readonly number[]) => void): HTMLElement {
  render(<HoursBar minutes={[240, 240]} labels={['MDP-1', 'MDP-2']} onCommit={onCommit} />)
  const bar = screen.getByTestId('hours-bar')
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 480, 10))
  return bar
}

it('HoursBar drag snaps to half hours and commits once on release', () => {
  const onCommit = vi.fn()
  setup(onCommit)
  fireEvent.pointerDown(screen.getByRole('slider', { name: /MDP-1/ }))
  moveTo(200)
  expect(screen.getByTestId('segment-MDP-1')).toHaveStyle({ width: '43.75%' })
  moveTo(215)
  expect(onCommit).not.toHaveBeenCalled()
  release()
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit).toHaveBeenCalledWith([210, 270])
})

it('does not commit when the boundary ends where it started', () => {
  const onCommit = vi.fn()
  setup(onCommit)
  fireEvent.pointerDown(screen.getByRole('slider', { name: /MDP-1/ }))
  moveTo(240)
  release()
  expect(onCommit).not.toHaveBeenCalled()
})
