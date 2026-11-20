import { screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderWithQuery } from '../testSupport.js'
import { BoardTable, type RowWork } from './BoardTable.js'
import { boardRow, ticketPr } from './workTestSupport.js'

function work(prs: RowWork['prs']): RowWork {
  return { prs, repoLabels: {}, readyToTest: {}, onReadyToTest: vi.fn() }
}

it('PRs sit in a column of their own, not after the summary', () => {
  const rows = [boardRow('MDP-1', 'A long summary'), boardRow('MDP-2', 'No PR yet')]
  renderWithQuery(
    <BoardTable
      rows={rows}
      view="working"
      language="en"
      onAction={vi.fn()}
      work={work({ 'MDP-1': [ticketPr('dev')] })}
    />,
  )
  const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
  expect(headers.slice(0, 4)).toEqual(['Key', 'Summary', 'PR', 'Status'])
  const [, first, second] = screen.getAllByRole('row')
  if (first === undefined || second === undefined) {
    throw new Error('expected two rows')
  }
  const cells = within(first).getAllByRole('cell')
  expect(within(cells[1] ?? first).queryByRole('button', { name: /PR 1/ })).toBeNull()
  expect(within(cells[2] ?? first).getByRole('button', { name: /PR 1/ })).toBeInTheDocument()
  expect(within(second).queryByRole('button', { name: /PR/ })).toBeNull()
})

it('a table with no PR at all leaves the PR column out', () => {
  renderWithQuery(
    <BoardTable
      rows={[boardRow('MDP-1', 'A summary')]}
      view="working"
      language="en"
      onAction={vi.fn()}
      work={work({})}
    />,
  )
  const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
  expect(headers).not.toContain('PR')
})

it('label columns are centered while the summary stays left', () => {
  renderWithQuery(
    <BoardTable
      rows={[boardRow('MDP-1', 'A summary')]}
      view="working"
      language="en"
      onAction={vi.fn()}
    />,
  )
  const headers = screen.getAllByRole('columnheader')
  const cells = within(screen.getAllByRole('row')[1] as HTMLElement).getAllByRole('cell')
  for (const index of [0, 2, 3, 4, 5]) {
    expect(headers[index]).toHaveClass('text-center')
    expect(cells[index]).toHaveClass('text-center')
  }
  expect(headers[1]).not.toHaveClass('text-center')
  expect(cells[1]).not.toHaveClass('text-center')
})
