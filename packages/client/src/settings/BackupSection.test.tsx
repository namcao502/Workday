import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, sentJson, stubFetch } from '../testSupport.js'
import { BackupSection } from './BackupSection.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.__workdayDesktop
  delete window.chrome
})

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

it('export downloads the file with the typed password', async () => {
  const fetchMock = stubFetch(
    () =>
      new Response('{"format":"workday-backup"}', {
        headers: {
          'Content-Disposition': 'attachment; filename="workday-backup-20261120.wdbackup"',
        },
      }),
  )
  const createUrl = vi.fn(() => 'blob:x')
  Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() })
  const names: string[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download)
  })
  renderWithQuery(<BackupSection />)
  type('Backup password', 'long-enough')
  type('Confirm password', 'long-enough')
  fireEvent.click(screen.getByRole('button', { name: 'Export' }))
  await waitFor(() => {
    expect(names).toEqual(['workday-backup-20261120.wdbackup'])
  })
  expect(sentJson(fetchMock)).toEqual({ password: 'long-enough' })
  expect(createUrl).toHaveBeenCalledTimes(1)
})

it('mismatched passwords block export', () => {
  const fetchMock = stubFetch(() => new Response(''))
  renderWithQuery(<BackupSection />)
  type('Backup password', 'long-enough')
  type('Confirm password', 'different')
  expect(screen.getByText('The passwords do not match')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  expect(fetchMock).not.toHaveBeenCalled()
})

function pickFile(): void {
  const file = new File(['{"format":"workday-backup"}'], 'a.wdbackup')
  fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } })
}

it('import shows the files and a restart hint', async () => {
  const fetchMock = stubFetch(() => jsonResponse({ files: ['config.json', 'master.key'] }))
  renderWithQuery(<BackupSection />)
  pickFile()
  type('File password', 'long-enough')
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  expect(await screen.findByText(/config\.json, master\.key/)).toBeInTheDocument()
  expect(screen.getByText('Restart Workday to apply.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Restart now' })).not.toBeInTheDocument()
  expect(sentJson(fetchMock)).toEqual({
    password: 'long-enough',
    data: '{"format":"workday-backup"}',
  })
})

it('wrong password shows its message', async () => {
  stubFetch(() => jsonResponse({ ok: false, error: { code: 'backupWrongPassword' } }, 400))
  renderWithQuery(<BackupSection />)
  pickFile()
  type('File password', 'nope-nope')
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  expect(await screen.findByText('Wrong password for the backup file')).toBeInTheDocument()
})

it('restart now posts the server restart message in the desktop shell', async () => {
  const postMessage = vi.fn()
  window.__workdayDesktop = true
  window.chrome = {
    webview: { postMessage, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  }
  stubFetch(() => jsonResponse({ files: ['config.json'] }))
  renderWithQuery(<BackupSection />)
  pickFile()
  type('File password', 'long-enough')
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Restart now' }))
  expect(postMessage).toHaveBeenCalledWith({ type: 'server', action: 'restart' })
})
