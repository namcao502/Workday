import { Button, TextArea } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.js'
import { chatKey } from '../api/useWorkspace.js'
import { interruptSession, sendPrompt } from '../api/workspaceApi.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'

const MAX_ROWS_PX = 160 // 8 lines of text-sm

interface ChatComposerProps {
  readonly session: string
  readonly working: boolean
}

function failureText(error: unknown): string {
  if (error instanceof ApiError && error.code !== null) {
    return errorText({ code: error.code })
  }
  return t('Could not send.', 'Không gửi được.')
}

// The prompt box: Enter sends, Shift+Enter adds a line, Stop (or Esc) replaces Send while Claude works.
export function ChatComposer({ session, working }: ChatComposerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

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
    if (prompt === '' || working) {
      return
    }
    setText('')
    void run(() => sendPrompt(session, prompt))
  }

  function stop(): void {
    void run(() => interruptSession(session))
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape' && working) {
      stop()
    }
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {failure === null ? null : (
        <p className="text-sm text-danger" role="alert">
          {failure}
        </p>
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
          }}
          onKeyDown={onKeyDown}
        />
        {working ? (
          <Button variant="danger" size="sm" onPress={stop}>
            {t('Stop', 'Dừng')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" isDisabled={text.trim() === ''} onPress={submit}>
            {t('Send', 'Gửi')}
          </Button>
        )}
      </div>
    </div>
  )
}
