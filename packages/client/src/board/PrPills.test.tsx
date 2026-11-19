import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PrPills } from './PrPills.js'
import { ticketPr } from './workTestSupport.js'

it('shows one button with the PR count and the worst state as its dot', () => {
  render(<PrPills prs={[ticketPr('main', { build: 'failed' }), ticketPr('dev')]} repoLabels={{}} />)
  expect(screen.getByRole('button', { name: 'PR 2: Build failed' })).toBeInTheDocument()
  expect(screen.getByTitle('Build failed')).toHaveTextContent('PR 2')
  expect(screen.getByTestId('pr-dot')).toHaveClass('bg-danger')
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('lists each PR in the popover, a failed build included, and opens it in a new tab', async () => {
  const failed = ticketPr('main', { build: 'failed' })
  render(<PrPills prs={[failed, ticketPr('dev')]} repoLabels={{ Portal: 'Portal API' }} />)
  fireEvent.click(screen.getByRole('button', { name: /PR 2/ }))
  const link = await screen.findByRole('link', { name: /Portal API main.*Build failed/ })
  expect(link).toHaveAttribute('href', failed.pr.url)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(screen.getByRole('link', { name: /Portal API dev.*Waiting/ })).toBeInTheDocument()
})

it('under a PR column the button names the worst state instead of repeating PR', () => {
  render(
    <PrPills
      prs={[ticketPr('main', { build: 'failed' }), ticketPr('dev')]}
      repoLabels={{}}
      showState
    />,
  )
  const button = screen.getByRole('button', { name: 'PR 2: Build failed' })
  expect(button).toHaveTextContent('Build failed')
  expect(button).not.toHaveTextContent('PR')
})
