import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog.js'

it('ConfirmDialog confirms and cancels', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      message="Sure?"
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('Sure?')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(onCancel).toHaveBeenCalledTimes(1)
})
