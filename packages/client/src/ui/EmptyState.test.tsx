import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState.js'

describe('EmptyState', () => {
  it('shows the message without an action', () => {
    render(<EmptyState icon={<svg data-testid="icon" />} message="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('runs the action from its button', () => {
    const onPress = vi.fn()
    render(
      <EmptyState
        icon={<svg />}
        message="Jira is not connected"
        action={{ label: 'Open Settings', onPress }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(onPress).toHaveBeenCalledOnce()
  })
})
