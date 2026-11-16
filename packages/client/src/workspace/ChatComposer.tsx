import { Button, CloseButton, TextArea } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { AgentCommand, AgentImage, AgentImageType } from '@workday/core'
import { useLayoutEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.js'
import { chatKey, useFilePaths } from '../api/useWorkspace.js'
import { interruptSession, sendPrompt } from '../api/workspaceApi.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import {
  activeToken,
  applySuggestion,
  commandSuggestions,
  fileSuggestions,
  type Suggestion,
} from './composerMenu.js'

const MAX_ROWS_PX = 160 // 8 lines of text-sm
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 5_000_000
const IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

interface PastedImage extends AgentImage {
  readonly id: number
}

function isImageType(value: string): value is AgentImageType {
  return IMAGE_TYPES.has(value)
}

// The base64 part of a data URL read from the pasted file.
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => {
      reject(new Error('read failed'))
    }
    reader.readAsDataURL(file)
  })
}

interface ChatComposerProps {
  readonly session: string
  readonly tabId: string
  readonly commands: readonly AgentCommand[]
  readonly working: boolean
}

function failureText(error: unknown): string {
  if (error instanceof ApiError && error.code !== null) {
    return errorText({ code: error.code })
  }
  return t('Could not send.', 'Không gửi được.')
}

// The prompt box: Enter sends, Shift+Enter adds a line, while Claude works Stop appears and a message typed now queues behind the turn.
export function ChatComposer({
  session,
  tabId,
  commands,
  working,
}: ChatComposerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [images, setImages] = useState<readonly PastedImage[]>([])
  const nextImageId = useRef(1)
  const [picked, setPicked] = useState(0)
  const [closedAt, setClosedAt] = useState<string | null>(null) // the text whose menu Esc closed

  const token = activeToken(text, caret)
  const filePaths = useFilePaths(tabId, token?.kind === 'file')
  let suggestions: readonly Suggestion[] = []
  if (token !== null && closedAt !== text) {
    suggestions =
      token.kind === 'command'
        ? commandSuggestions(commands, token.query)
        : fileSuggestions(filePaths, token.query)
  }
  const current = Math.min(picked, Math.max(suggestions.length - 1, 0))

  function choose(suggestion: Suggestion): void {
    if (token === null) {
      return
    }
    const next = applySuggestion(text, caret, token, suggestion)
    setText(next.text)
    setCaret(next.caret)
    setPicked(0)
    requestAnimationFrame(() => {
      boxRef.current?.focus()
      boxRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  // Grow with the text up to eight lines, then scroll.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (box !== null) {
      box.style.height = 'auto'
      box.style.height = `${String(Math.min(box.scrollHeight, MAX_ROWS_PX))}px`
    }
  }, [text])

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action()
      setFailure(null)
    } catch (error: unknown) {
      setFailure(failureText(error))
    }
    await queryClient.invalidateQueries({ queryKey: chatKey(session) })
  }

  function submit(): void {
    const prompt = text.trim()
    if (prompt === '' && images.length === 0) {
      return
    }
    const attached = images.map(({ mediaType, data }) => ({ mediaType, data }))
    setText('')
    setImages([])
    void run(() => sendPrompt(session, prompt, attached))
  }

  async function attach(files: readonly File[]): Promise<void> {
    const room = MAX_IMAGES - images.length
    if (files.length > room || files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setFailure(t('At most 5 images of 5 MB each.', 'Tối đa 5 ảnh, mỗi ảnh 5 MB.'))
    }
    const accepted = files
      .filter((file) => file.size <= MAX_IMAGE_BYTES)
      .slice(0, Math.max(room, 0))
    try {
      const added = await Promise.all(
        accepted.map(async (file): Promise<PastedImage> => {
          const mediaType = isImageType(file.type) ? file.type : 'image/png'
          const id = nextImageId.current
          nextImageId.current += 1
          return { id, mediaType, data: await readBase64(file) }
        }),
      )
      setImages((current) => [...current, ...added])
    } catch {
      setFailure(t('Could not read the image.', 'Không đọc được ảnh.'))
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const files = [...event.clipboardData.files].filter((file) => isImageType(file.type))
    if (files.length !== 0) {
      event.preventDefault()
      void attach(files)
    }
  }

  function stop(): void {
    void run(() => interruptSession(session))
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    const chosen = suggestions[current]
    if (chosen !== undefined) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setPicked((current + step + suggestions.length) % suggestions.length)
        return
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault()
        choose(chosen)
        return
      }
      if (event.key === 'Escape') {
        setClosedAt(text)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape' && working) {
      stop()
    }
  }

  return (
    <div className="relative flex flex-col gap-1 p-2">
      {suggestions.length === 0 ? null : (
        <ul
          role="listbox"
          aria-label={t('Suggestions', 'Gợi ý')}
          className="absolute inset-x-2 bottom-full z-10 mb-1 flex max-h-64 flex-col gap-0.5 overflow-auto rounded-2xl bg-surface p-1 shadow-surface"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.key} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === current}
                className={`flex w-full items-baseline gap-2 rounded-xl px-3 py-1.5 text-left text-sm ${index === current ? 'bg-accent-soft' : 'hover:bg-surface-secondary'}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(suggestion)
                }}
              >
                <span className="font-mono">{suggestion.label}</span>
                <span className="truncate text-xs text-muted">{suggestion.note}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {failure === null ? null : (
        <p className="text-sm text-danger" role="alert">
          {failure}
        </p>
      )}
      {images.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2" aria-label={t('Attached images', 'Ảnh đính kèm')}>
          {images.map((image) => (
            <li key={image.id} className="relative">
              <img
                alt={t('Pasted image', 'Ảnh đã dán')}
                className="size-16 rounded-xl object-cover"
                src={`data:${image.mediaType};base64,${image.data}`}
              />
              <CloseButton
                className="absolute -right-1 -top-1 size-5 bg-surface shadow-sm hover:bg-danger hover:text-danger-foreground"
                aria-label={t('Remove image', 'Bỏ ảnh')}
                onPress={() => {
                  setImages((current) => current.filter((item) => item.id !== image.id))
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <TextArea
          ref={boxRef}
          fullWidth
          variant="secondary"
          rows={1}
          className="resize-none overflow-y-auto"
          aria-label={t('Message to Claude', 'Tin nhắn cho Claude')}
          placeholder={t(
            'Enter to send, Shift+Enter for a new line',
            'Enter để gửi, Shift+Enter xuống dòng',
          )}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setCaret(event.target.selectionStart)
            setPicked(0)
          }}
          onSelect={(event) => {
            setCaret(event.currentTarget.selectionStart)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        {working ? (
          <Button variant="danger" size="sm" onPress={stop}>
            {t('Stop', 'Dừng')}
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          isDisabled={text.trim() === '' && images.length === 0}
          onPress={submit}
        >
          {working ? t('Queue', 'Xếp hàng') : t('Send', 'Gửi')}
        </Button>
      </div>
    </div>
  )
}
