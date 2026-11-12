import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, sentJson, stubFetch } from '../testSupport.js'
import { guessDeviceName, PairPage } from './PairPage.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fillAndPair(): void {
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: ' ab c123 ' } })
  fireEvent.change(screen.getByLabelText('Device name'), { target: { value: 'My phone' } })
  fireEvent.click(screen.getByRole('button', { name: 'Pair' }))
}

it('the pair page sends the code and the name, then reloads once approved', async () => {
  let polls = 0
  const fetchMock = stubFetch((url) => {
    if (url === '/api/pair') {
      return jsonResponse({ requestId: 'r1' })
    }
    polls += 1
    return jsonResponse({ status: polls < 2 ? 'waiting' : 'approved' })
  })
  const onApproved = vi.fn()
  render(<PairPage onApproved={onApproved} pollMs={5} />)
  fillAndPair()
  expect(await screen.findByText('Waiting for approval on the PC...')).toBeInTheDocument()
  expect(sentJson(fetchMock)).toEqual({ code: 'ABC123', name: 'My phone' })
  await waitFor(() => {
    expect(onApproved).toHaveBeenCalledTimes(1)
  })
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/pair/status?id=r1')).toBe(true)
})

it('a rejected pairing lets the user try again', async () => {
  stubFetch((url) =>
    url === '/api/pair' ? jsonResponse({ requestId: 'r1' }) : jsonResponse({ status: 'rejected' }),
  )
  const onApproved = vi.fn()
  render(<PairPage onApproved={onApproved} pollMs={5} />)
  fillAndPair()
  expect(await screen.findByText('The PC rejected this device')).toBeInTheDocument()
  expect(screen.getByLabelText('Code')).toBeInTheDocument()
  expect(onApproved).not.toHaveBeenCalled()
})

it('a wrong code shows the error and keeps the form', async () => {
  stubFetch(() => jsonResponse({ ok: false, error: { code: 'wrongCode' } }, 409))
  render(<PairPage onApproved={vi.fn()} pollMs={5} />)
  fillAndPair()
  expect(await screen.findByText('That code is not right')).toBeInTheDocument()
})

it('guesses the device name from the user agent', () => {
  expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone')
  expect(guessDeviceName('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('iPad')
  expect(guessDeviceName('Mozilla/5.0 (Linux; Android 14)')).toBe('Android')
  expect(guessDeviceName('Mozilla/5.0 (X11; Linux)')).toBe('Phone')
})
