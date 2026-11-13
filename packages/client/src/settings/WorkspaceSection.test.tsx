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
      workspace: { ...base.config.workspace, devRepoPath: 'C:\\Repos\\Dev', chatView: false },
    },
  }
}

it('Save sends the workspace block with trimmed values, lines and the toggle', async () => {
  const fetchMock = stubFetch(() => jsonResponse(saved()))
  renderWithQuery(<WorkspaceSection settings={saved()} />)
  fireEvent.change(screen.getByLabelText('Sibling repo pattern'), {
    target: { value: ' *-Angular ' },
  })
  fireEvent.change(screen.getByLabelText('Start prompt'), { target: { value: 'ship {key}' } })
  fireEvent.change(screen.getByLabelText('Local-only paths'), {
    target: { value: '.claude/\n\n .env.local ' },
  })
  fireEvent.click(screen.getByRole('switch', { name: 'Chat view' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  expect(sentJson(fetchMock)['workspace']).toEqual({
    devRepoPath: 'C:\\Repos\\Dev',
    siblingRepoGlob: '*-Angular',
    startPrompt: 'ship {key}',
    claudeExecutable: null,
    localOnlyPaths: ['.claude/', '.env.local'],
    chatView: true,
  })
  expect(await screen.findByText('Saved')).toBeInTheDocument()
})
