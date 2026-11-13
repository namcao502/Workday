import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AzureDevOpsSection } from './AzureDevOpsSection.js'
import { jsonResponse, renderWithQuery, sentJson, settingsView, stubFetch } from '../testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('azure devops section keeps the repo label order and never shows the saved PAT', async () => {
  const base = settingsView({ adoPatSource: 'file' })
  const settings = {
    ...base,
    config: {
      ...base.config,
      azureDevOps: {
        organization: 'org',
        project: 'proj',
        repoLabels: { Zeta: 'Z', Alpha: 'A' },
        devPipelineFolder: null,
      },
    },
  }
  const fetchMock = stubFetch(() => jsonResponse(settings))
  renderWithQuery(<AzureDevOpsSection settings={settings} />)
  expect(screen.getByLabelText('Azure DevOps PAT')).toHaveValue('•'.repeat(8))
  expect(screen.getByLabelText('Repo labels')).toHaveValue('Zeta=Z\nAlpha=A')
  fireEvent.change(screen.getByLabelText('Repo labels'), {
    target: { value: 'Zeta=Z\nAlpha=A\nBeta=B' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
  })
  const body = sentJson(fetchMock)
  expect(body).not.toHaveProperty('adoPat')
  expect(Object.keys((body['azureDevOps'] as { repoLabels: object }).repoLabels)).toEqual([
    'Zeta',
    'Alpha',
    'Beta',
  ])
})
