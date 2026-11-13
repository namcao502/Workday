import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { TeamsReadView } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch } from '../../testSupport.js'
import { TeamsPostCard } from './TeamsPostCard.js'
import { outcomeOf, type SendAction } from './teamsSend.js'

type NotPosted = Extract<TeamsReadView, { state: 'notPosted' }>

function view(posted: boolean): NotPosted {
  return {
    state: 'notPosted',
    options: [],
    channelId: 'ch1',
    draft: { subject: 'MDP-1 Title', body: 'text', bodyHtml: '<p>text<script>x</script></p>' },
    posted,
    pending: [],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('post card warns first when the ticket was posted', async () => {
  const fetchMock = stubFetch(() => jsonResponse({ ok: true, id: 'p1' }))
  const send: SendAction = async (action) => outcomeOf(await action())
  renderWithQuery(
    <TeamsPostCard ticket="MDP-1" view={view(true)} label="New post" locked={false} send={send} />,
  )
  expect(screen.getByLabelText('Subject')).toHaveValue('MDP-1 Title')
  const editor = screen.getByRole('textbox', { name: 'New post' })
  await waitFor(() => {
    expect(editor.textContent).toBe('text')
  })
  fireEvent.click(screen.getByRole('button', { name: 'Post' }))
  expect(await screen.findByText(/already posted/)).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Post' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/teams/MDP-1/post',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
