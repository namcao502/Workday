import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { SettingsView } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceSection } from './WorkspaceSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function saved(): SettingsView {
  const base = settingsView()
  return {
    ...base,
    config: {
      ...base.config,
      workspace: {
        ...base.config.workspace,
        devRepoPath: 'C:\\Repos\\Dev',
      },
    },
  }
}

it('Save sends the workspace block with trimmed values and lines', async () => {
  const fetchMock = stubFetch(() => jsonResponse(saved()))
  renderWithQuery(<WorkspaceSection settings={saved()} />)
  fireEvent.change(screen.getByLabelText('Sibling repo pattern'), {
    target: { value: ' *-Angular ' },
  })
  fireEvent.change(screen.getByLabelText('Start prompt'), { target: { value: 'ship {key}' } })
  fireEvent.change(screen.getByLabelText('Local-only paths'), {
    target: { value: '.claude/\n\n .env.local ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)['workspace']).toEqual({
    devRepoPath: 'C:\\Repos\\Dev',
    siblingRepoGlob: '*-Angular',
    startPrompt: 'ship {key}',
    autoStartTickets: true,
    claudeExecutable: null,
    localOnlyPaths: ['.claude/', '.env.local'],
  })
  expect(await screen.findByText('Saved')).toBeInTheDocument()
})

it('the auto start switch is saved with the workspace block', async () => {
  const fetchMock = stubFetch(() => jsonResponse(settingsView()))
  renderWithQuery(<WorkspaceSection settings={settingsView()} />)
  const toggle = screen.getByRole('switch', { name: /Start a newly assigned ticket by itself/ })
  expect(toggle).toBeChecked()
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)['workspace']).toMatchObject({ autoStartTickets: false })
})

it('the Clean up worktrees button opens the cleanup dialog', async () => {
  stubFetch(() => jsonResponse({ rows: [], errors: [] }))
  renderWithQuery(<WorkspaceSection settings={settingsView()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Clean up worktrees' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
