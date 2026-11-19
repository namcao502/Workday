import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PrPills } from './PrPills.js'
import { hoverTip } from '../testSupport.js'
import { ticketPr } from './workTestSupport.js'

it('shows one button with the PR count and the worst state as its dot', async () => {
  render(<PrPills prs={[ticketPr('main', { build: 'failed' }), ticketPr('dev')]} repoLabels={{}} />)
  expect(screen.getByRole('button', { name: 'PR 2: Build failed' })).toBeInTheDocument()
  expect(await hoverTip(screen.getByText('PR 2'))).toHaveTextContent('Build failed')
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

it('shows the open comments of the open PRs on the button and on each PR row', async () => {
  render(
    <PrPills
      prs={[
        ticketPr('main', { openThreadCount: 2 }),
        ticketPr('dev', { openThreadCount: 1 }),
        ticketPr('old', { status: 'completed', openThreadCount: 4 }),
      ]}
      repoLabels={{}}
    />,
  )
  const button = screen.getByRole('button', { name: 'PR 3: Waiting, 3 open comments' })
  expect(button).toHaveTextContent('3')
  fireEvent.click(button)
  expect(await screen.findByRole('link', { name: /main.*2 open comments/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /dev.*1 open comment$/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /old.*Merged$/ })).toBeInTheDocument()
})

it('shows no comment count when nothing is open or the count is unknown', () => {
  render(
    <PrPills prs={[ticketPr('main', { openThreadCount: 0 }), ticketPr('dev')]} repoLabels={{}} />,
  )
  expect(screen.getByRole('button', { name: 'PR 2: Waiting' })).toBeInTheDocument()
})
