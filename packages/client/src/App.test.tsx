import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App.js'
import { jsonResponse, settingsView, stubFetch, stubMatchMedia } from './testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('sets the theme and shows the default page once the settings load', async () => {
  stubMatchMedia(false)
  stubFetch(() =>
    jsonResponse(settingsView({ config: { ...settingsView().config, theme: 'light' } })),
  )
  render(<App socketFactory={() => ({ onmessage: null, onclose: null, close: vi.fn() })} />)
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(document.documentElement.dataset['theme']).toBe('light')
})

it('remembers the theme so index.html can apply it before the settings load', async () => {
  localStorage.removeItem('workday.theme')
  stubMatchMedia(false)
  stubFetch(() =>
    jsonResponse(settingsView({ config: { ...settingsView().config, theme: 'light' } })),
  )
  render(<App socketFactory={() => ({ onmessage: null, onclose: null, close: vi.fn() })} />)
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(localStorage.getItem('workday.theme')).toBe('light')
})
