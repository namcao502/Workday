import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PrPills } from './PrPills.js'
import { ticketPr } from './workTestSupport.js'

it('pr pills show a failed build and open the PR in a new tab', () => {
  const failed = ticketPr('main', { build: 'failed' })
  render(<PrPills prs={[failed, ticketPr('dev')]} repoLabels={{ Portal: 'Portal API' }} />)
  const pill = screen.getByRole('link', { name: /Portal API main.*Build failed/ })
  expect(pill).toHaveAttribute('href', failed.pr.url)
  expect(pill).toHaveAttribute('target', '_blank')
  expect(pill).toHaveAttribute('rel', 'noopener noreferrer')
  expect(screen.getByRole('link', { name: /Portal API dev.*Waiting/ })).toBeInTheDocument()
})
