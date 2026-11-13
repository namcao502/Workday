import type { ReadyToTestOutcome } from '@workday/core'
import { useState } from 'react'
import { actionErrorText, useWorkActions } from '../api/useWork.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from '../timesheet/ConfirmDialog.js'

export function outcomeText(key: string, outcome: ReadyToTestOutcome): string {
  switch (outcome.status) {
    case 'moved':
      return t(`${key} moved to Ready to Test`, `${key} đã chuyển sang Ready to Test`)
    case 'alreadyPast':
      return t(`${key} is already past Ready to Test`, `${key} đã qua Ready to Test`)
    case 'notFound':
      return t(`${key} was not found in Jira`, `Không tìm thấy ${key} trên Jira`)
    case 'busy':
      return t('Another move is running, try again', 'Đang có thao tác chuyển khác, hãy thử lại')
    case 'failed':
      return t(`Stopped at ${outcome.step}`, `Dừng ở bước ${outcome.step}`)
  }
}

interface PendingMove {
  readonly key: string
  readonly steps: readonly string[]
}

export interface ReadyToTestFlow {
  readonly ask: (key: string, steps: readonly string[]) => void
  readonly message: string | null // the outcome of the last move
  readonly dialog: React.JSX.Element | null
}

// Ask first, then move; the Board shows `dialog` and `message` wherever the move was started from.
export function useReadyToTest(): ReadyToTestFlow {
  const actions = useWorkActions()
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function move({ key }: PendingMove): Promise<void> {
    setMessage(null)
    try {
      setMessage(outcomeText(key, await actions.readyToTest(key)))
    } catch (error: unknown) {
      setMessage(actionErrorText(error))
    }
  }

  const dialog =
    pending === null ? null : (
      <ConfirmDialog
        message={t(
          `Move ${pending.key}: ${pending.steps.join(' -> ')}?`,
          `Chuyển ${pending.key}: ${pending.steps.join(' -> ')}?`,
        )}
        confirmLabel={t('Move', 'Chuyển')}
        onConfirm={() => {
          setPending(null)
          void move(pending)
        }}
        onCancel={() => {
          setPending(null)
        }}
      />
    )
  return {
    ask: (key, steps) => {
      setPending({ key, steps })
    },
    message,
    dialog,
  }
}
