import type { ReadyToTestOutcome } from '@workday/core'
import { useState } from 'react'
import { actionErrorText, useWorkActions } from '../api/useWork.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'

export function outcomeText(key: string, outcome: ReadyToTestOutcome): string {
  switch (outcome.status) {
    case 'moved':
      return t('board.movedToReadyToTest', { key })
    case 'alreadyPast':
      return t('board.isAlreadyPastReadyToTest', { key })
    case 'notFound':
      return t('board.wasNotFoundInJira', { key })
    case 'busy':
      return t('board.anotherMoveIsRunningTryAgain')
    case 'failed':
      return t('board.stoppedAt', { step: outcome.step })
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
        message={t('board.move', { key: pending.key, steps: pending.steps.join(' -> ') })}
        confirmLabel={t('board.move2')}
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
