import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TeamsDraft, TeamsPerson } from '@workday/core'
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

it('the code block button turns the line into a pre, and pressing it inside one undoes it', () => {
  const exec = vi.fn(() => true)
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- execCommand is the editor API under test
  document.execCommand = exec
  const editor = renderComposer('reply', vi.fn())
  type(editor, 'let a = 1')
  fireEvent.click(screen.getByRole('button', { name: /Insert code block/ }))
  expect(exec).toHaveBeenLastCalledWith('formatBlock', false, 'pre')
  editor.innerHTML = '<pre>let a = 1</pre>'
  window.getSelection()?.collapse(editor.querySelector('pre')?.firstChild ?? editor, 2)
  fireEvent.click(screen.getByRole('button', { name: /Insert code block/ }))
  expect(exec).toHaveBeenLastCalledWith('formatBlock', false, 'p')
})

it('a pasted image is shown in the text and sent as a marker plus the image', async () => {
  class LoadedImage {
    onload: (() => void) | null = null
    naturalWidth = 640
    naturalHeight = 480
    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', LoadedImage)
  const drafts: TeamsDraft[] = []
  const onSend: TeamsComposerProps['onSend'] = (draft) => {
    drafts.push(draft)
    return Promise.resolve({ ok: true })
  }
  const editor = renderComposer('reply', onSend)
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png', {
    type: 'image/png',
  })
  fireEvent.paste(editor, { clipboardData: { files: [file], getData: () => '' } })
  await waitFor(() => {
    expect(editor.querySelector('img[data-local-image]')).not.toBeNull()
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => {
    expect(drafts).toHaveLength(1)
  })
  expect(drafts[0]?.html).toBe('<img data-image="0">')
  expect(drafts[0]?.images).toHaveLength(1)
  expect(drafts[0]?.images?.[0]).toMatchObject({
    contentType: 'image/png',
    fileName: 'shot.png',
    width: 640,
    height: 480,
  })
  vi.unstubAllGlobals()
})

it('refuses an image that is not PNG, JPEG or GIF', async () => {
  const editor = renderComposer('reply', vi.fn())
  fireEvent.paste(editor, {
    clipboardData: {
      files: [new File(['x'], 'a.webp', { type: 'image/webp' })],
      getData: () => '',
    },
  })
  expect(await screen.findByText(/a\.webp is not a PNG, JPEG or GIF/)).toBeInTheDocument()
})

it('a dropped file is listed, can be removed, and is sent with the draft', async () => {
  const drafts: TeamsDraft[] = []
  const onSend: TeamsComposerProps['onSend'] = (draft) => {
    drafts.push(draft)
    return Promise.resolve({ ok: true })
  }
  const editor = renderComposer('reply', onSend)
  const keep = new File(['hello'], 'notes.txt', { type: 'text/plain' })
  const drop = new File(['bye'], 'old.txt', { type: 'text/plain' })
  fireEvent.drop(editor, { dataTransfer: { files: [keep, drop] } })
  expect(await screen.findByText('notes.txt')).toBeInTheDocument()
  expect(await screen.findByText('old.txt')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove old.txt' }))
  expect(screen.queryByText('old.txt')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => {
    expect(drafts).toHaveLength(1)
  })
  expect(drafts[0]?.files).toEqual([{ data: 'aGVsbG8=', fileName: 'notes.txt' }])
  await waitFor(() => {
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
  })
})

it('refuses an empty file and offers no attach button when editing', async () => {
  const editor = renderComposer('reply', vi.fn())
  fireEvent.drop(editor, { dataTransfer: { files: [new File([], 'none.txt')] } })
  expect(await screen.findByText('none.txt is empty.')).toBeInTheDocument()
  cleanup()
  renderComposer('edit', vi.fn())
  expect(screen.queryByRole('button', { name: 'Attach a file' })).not.toBeInTheDocument()
})

it('the quote button wraps the line and unwraps it when pressed inside a quote', () => {
  const exec = vi.fn(() => true)
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- execCommand is the editor API under test
  document.execCommand = exec
  const editor = renderComposer('reply', vi.fn())
  type(editor, 'quoted')
  fireEvent.click(screen.getByRole('button', { name: /^Quote/ }))
  expect(exec).toHaveBeenLastCalledWith('formatBlock', false, 'blockquote')
  editor.innerHTML = '<blockquote>quoted</blockquote>'
  window.getSelection()?.collapse(editor.querySelector('blockquote')?.firstChild ?? editor, 2)
  fireEvent.click(screen.getByRole('button', { name: /^Quote/ }))
  expect(editor.querySelector('blockquote')).toBeNull()
  expect(editor.textContent).toBe('quoted')
})

it('the toolbar marks the format at the caret as pressed', () => {
  const editor = renderComposer('reply', vi.fn())
  editor.innerHTML = '<blockquote>quoted</blockquote>'
  window.getSelection()?.collapse(editor.querySelector('blockquote')?.firstChild ?? editor, 2)
  fireEvent(document, new Event('selectionchange'))
  expect(screen.getByRole('button', { name: /^Quote/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /^Bulleted list/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

it('Ctrl+K opens the link row with a hint', async () => {
  const editor = renderComposer('reply', vi.fn())
  fireEvent.keyDown(editor, { key: 'k', ctrlKey: true })
  expect(await screen.findByRole('textbox', { name: 'Link address' })).toHaveAttribute(
    'placeholder',
    'Paste a link, then Enter',
  )
})

it('Ctrl+click on a link in the text opens it; a plain click only places the caret', () => {
  const opened = vi.fn()
  vi.stubGlobal('open', opened)
  render(
    <TeamsComposer
      mode="post"
      people={[]}
      label="Post"
      submitLabel="Post"
      initialHtml='<p><a href="https://dev.azure.com/pr/1">PR</a></p>'
      onSend={vi.fn()}
    />,
  )
  const link = screen.getByText('PR')
  fireEvent.click(link)
  expect(opened).not.toHaveBeenCalled()
  fireEvent.click(link, { ctrlKey: true })
  expect(opened).toHaveBeenCalledWith('https://dev.azure.com/pr/1', '_blank', 'noopener,noreferrer')
  vi.unstubAllGlobals()
})

it('Shift+Enter puts a real line break in the draft, so Teams shows the next line on its own', () => {
  const editor = renderComposer('reply', vi.fn<TeamsComposerProps['onSend']>())
  type(editor, 'Text before')
  // The browser's own break in this pre-wrap box is a "\n", which HTML (and so Teams) reads as a space.
  const notPrevented = fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })
  expect(notPrevented).toBe(false)
  expect(editor.innerHTML).toBe('Text before<br><br>')
  // Typing goes on the new line: between the break and the one that holds that line open.
  const selection = window.getSelection()
  expect(selection?.anchorNode).toBe(editor)
  expect(selection?.anchorOffset).toBe(2)
})

it('Shift+Enter in the middle of the text adds a single break', () => {
  const editor = renderComposer('post', vi.fn<TeamsComposerProps['onSend']>())
  type(editor, 'ab')
  window.getSelection()?.collapse(editor.firstChild, 1)
  fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })
  expect(editor.innerHTML).toBe('a<br>b')
})
