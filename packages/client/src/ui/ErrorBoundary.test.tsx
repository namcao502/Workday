import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary.js'

function Boom({ crash }: { readonly crash: boolean }): React.JSX.Element {
  if (crash) {
    throw new Error('boom')
  }
  return <div>safe</div>
}

// React logs a caught render error; silence it so the run stays readable.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

it('renders children while they do not throw', () => {
  render(
    <ErrorBoundary>
      <Boom crash={false} />
    </ErrorBoundary>,
  )
  expect(screen.getByText('safe')).toBeInTheDocument()
})

it('shows the fallback when a child throws, and Try again recovers once it stops throwing', () => {
  const view = render(
    <ErrorBoundary>
      <Boom crash={true} />
    </ErrorBoundary>,
  )
  expect(screen.getByRole('alert')).toBeInTheDocument()

  view.rerender(
    <ErrorBoundary>
      <Boom crash={false} />
    </ErrorBoundary>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.getByText('safe')).toBeInTheDocument()
})

it('clears the error when resetKey changes', () => {
  const view = render(
    <ErrorBoundary resetKey="a">
      <Boom crash={true} />
    </ErrorBoundary>,
  )
  expect(screen.getByRole('alert')).toBeInTheDocument()

  view.rerender(
    <ErrorBoundary resetKey="b">
      <Boom crash={false} />
    </ErrorBoundary>,
  )
  expect(screen.getByText('safe')).toBeInTheDocument()
})
