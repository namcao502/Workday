import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch } from '../testSupport.js'
import { ChangesView } from './ChangesView.js'

it('Refresh rereads the open diff too, not only the list of changed files', async () => {
  const fetchMock = stubFetch((url) =>
    url.startsWith('/api/workspace/tabs/MDP-1/changes/diff')
      ? jsonResponse({ kind: 'full', original: 'a', modified: 'b' })
      : jsonResponse([
          {
            id: 'wt0',
            label: 'BE - Backend',
            files: [{ path: 'src/app.ts', status: 'modified' }],
            error: null,
          },
        ]),
  )
  const diffReads = (): number =>
    fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/workspace/tabs/MDP-1/changes/diff'))
      .length
  renderWithQuery(<ChangesView tabId="MDP-1" />)
  await waitFor(() => {
    expect(diffReads()).toBe(1)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => {
    expect(diffReads()).toBe(2)
  })
})
