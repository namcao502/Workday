import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubMatchMedia } from '../testSupport.js'
import { HeaderSlotContext } from './HeaderSlot.js'
import { Page } from './Page.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderInShell(phoneActionsBelow: boolean): HTMLElement {
  const slot = document.createElement('div')
  document.body.append(slot)
  render(
    <HeaderSlotContext.Provider value={slot}>
      <Page
        title="Insights"
        phoneActionsBelow={phoneActionsBelow}
        actions={<button>Refresh</button>}
      >
        <p>body</p>
      </Page>
    </HeaderSlotContext.Provider>,
  )
  return slot
}

it('keeps title and actions in the top bar on a wide screen', () => {
  stubMatchMedia(false)
  const slot = renderInShell(true)
  expect(slot).toHaveTextContent('Insights')
  expect(slot).toHaveTextContent('Refresh')
})

it('moves the actions under the top bar on a phone when the page asks for it', () => {
  stubMatchMedia(true)
  const slot = renderInShell(true)
  expect(slot).toHaveTextContent('Insights')
  expect(slot).not.toHaveTextContent('Refresh')
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
})

it('leaves the actions in the top bar on a phone by default', () => {
  stubMatchMedia(true)
  const slot = renderInShell(false)
  expect(slot).toHaveTextContent('Refresh')
})
