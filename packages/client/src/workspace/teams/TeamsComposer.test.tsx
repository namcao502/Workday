import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TeamsPerson } from '@workday/core'
import { expect, it, vi } from 'vitest'
import { TeamsComposer, type ComposeMode, type TeamsComposerProps } from './TeamsComposer.js'

const MINH = '8:orgid:11111111-1111-1111-1111-111111111111'

function person(index: number, displayName: string): TeamsPerson {
  const mri = `8:orgid:${String(index).padStart(8, '0')}-1111-1111-1111-111111111111`
  return { mri, displayName }
}

const PEOPLE: readonly TeamsPerson[] = [{ mri: MINH, displayName: 'Minh Đinh (Monster)' }]

function renderComposer(
  mode: ComposeMode,
  onSend: TeamsComposerProps['onSend'],
  people: readonly TeamsPerson[] = PEOPLE,
): HTMLElement {
  render(
    <TeamsComposer mode={mode} people={people} label="Reply" submitLabel="Send" onSend={onSend} />,
  )
  return screen.getByRole('textbox', { name: 'Reply' })
}

function type(editor: HTMLElement, text: string): void {
  editor.textContent = text
  window.getSelection()?.collapse(editor.firstChild, text.length)
  fireEvent.input(editor)
}

it('composer sends html with mention markers and clears only after success', async () => {
  const onSend = vi
    .fn<TeamsComposerProps['onSend']>()
    .mockResolvedValueOnce({ ok: false, message: 'failed', uncertain: false })
    .mockResolvedValueOnce({ ok: true })
  const editor = renderComposer('reply', onSend)
  type(editor, 'hi @din')
  fireEvent.mouseDown(screen.getByRole('option', { name: 'Minh Đinh (Monster)' }))
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('failed')).toBeInTheDocument()
  expect(editor.querySelector('span[data-mention="0"]')?.textContent).toBe('@Minh Đinh')
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => {
    expect(editor.innerHTML).toBe('')
  })
  const [draft, , confirm] = onSend.mock.calls[0] ?? []
  expect(draft?.html).toMatch(/<span data-mention="0"[^>]*>@Minh Đinh<\/span>/)
  expect(draft?.mentions).toEqual([
    { text: '@Minh Đinh', mri: MINH, displayName: 'Minh Đinh (Monster)' },
  ])
  expect(confirm).toBe(false)
})

it('typing @ lists at most eight people matched without accents', () => {
  const people = Array.from({ length: 10 }, (_, index) => person(index, `Đức ${String(index)}`))
  const editor = renderComposer('reply', vi.fn<TeamsComposerProps['onSend']>(), people)
  type(editor, '@duc')
  expect(screen.getAllByRole('option')).toHaveLength(8)
  type(editor, 'a@duc')
  expect(screen.queryByRole('option')).not.toBeInTheDocument()
})

it('pasting html inserts plain text', () => {
  const editor = renderComposer('reply', vi.fn<TeamsComposerProps['onSend']>())
  window.getSelection()?.collapse(editor, 0)
  fireEvent.paste(editor, {
    clipboardData: { getData: (kind: string) => (kind === 'text/plain' ? '<b>x</b>' : '<i>y</i>') },
  })
  expect(editor.querySelector('b, i')).toBeNull()
  expect(editor.textContent).toBe('<b>x</b>')
})

it('reply sends on Enter, post sends on Ctrl+Enter', async () => {
  const onSend = vi.fn<TeamsComposerProps['onSend']>().mockResolvedValue({ ok: true })
  const reply = renderComposer('reply', onSend)
  type(reply, 'one')
  fireEvent.keyDown(reply, { key: 'Enter', shiftKey: true })
  expect(onSend).not.toHaveBeenCalled()
  fireEvent.keyDown(reply, { key: 'Enter' })
  await waitFor(() => {
    expect(onSend).toHaveBeenCalledTimes(1)
  })
  render(<TeamsComposer mode="post" people={[]} label="Post" submitLabel="Post" onSend={onSend} />)
  const post = screen.getByRole('textbox', { name: 'Post' })
  type(post, 'two')
  fireEvent.keyDown(post, { key: 'Enter' })
  expect(onSend).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(post, { key: 'Enter', ctrlKey: true })
  await waitFor(() => {
    expect(onSend).toHaveBeenCalledTimes(2)
  })
})

it('an uncertain send asks before sending again with confirm', async () => {
  const onSend = vi
    .fn<TeamsComposerProps['onSend']>()
    .mockResolvedValueOnce({ ok: false, message: 'unsure', uncertain: true })
    .mockResolvedValueOnce({ ok: true })
  const editor = renderComposer('reply', onSend)
  type(editor, 'hello')
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(
    await screen.findByText('May have been sent - check the thread before sending again'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => {
    expect(onSend).toHaveBeenCalledTimes(2)
  })
  expect(onSend.mock.calls[1]?.[2]).toBe(true)
})
