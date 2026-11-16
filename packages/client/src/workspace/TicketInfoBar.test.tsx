import { cleanup, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boardOf, boardRow, workView } from '../board/workTestSupport.js'
import { jsonResponse, renderWithQuery, stubFetch } from '../testSupport.js'
import { TicketInfoBar, ticketFacts } from './TicketInfoBar.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function rowWith(changes: { dueDate?: string; eta?: string; timeSpentSeconds?: number }) {
  const base = boardRow('MDP-1', 'Fix the thing')
  return { ...base, ticket: { ...base.ticket, ...changes } }
}

it('ticketFacts lists the status, then due, ETA and logged time when set', () => {
  expect(ticketFacts(boardRow('MDP-1', 'x'))).toEqual(['In Progress'])
  expect(
    ticketFacts(rowWith({ dueDate: '2026-11-13', eta: '2026-11-12', timeSpentSeconds: 9000 })),
  ).toEqual(['In Progress', 'Due Nov 13', 'ETA Nov 12', 'Logged 2.5h'])
})

it('the info bar shows the key, summary and facts of the ticket tab', async () => {
  stubFetch((url) =>
    jsonResponse(
      url === '/api/board'
        ? boardOf([boardRow('MDP-1', 'Fix the thing')])
        : url === '/api/work'
          ? workView({ readyToTest: { 'MDP-1': ['Ready to Test'] } })
          : {},
    ),
  )
  renderWithQuery(<TicketInfoBar ticketKey="MDP-1" />)
  expect(await screen.findByText('Fix the thing')).toBeInTheDocument()
  expect(screen.getByText('MDP-1')).toBeInTheDocument()
  expect(screen.getByText('In Progress')).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Ready to Test' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'VS Code' })).toBeInTheDocument()
})
