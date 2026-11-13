import { useQueryClient } from '@tanstack/react-query'
import type { AppError } from '@workday/core'
import { useState } from 'react'
import { queryKeys } from '../api/client.js'
import { useStartWarning } from '../api/useWorkspace.js'
import { openTicket, startTicket } from '../api/workspaceApi.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { navigateToWorkspace } from '../shell/pages.js'

export interface TicketLauncher {
  readonly start: (key: string) => void
  readonly open: (key: string) => void
  readonly recreateKey: string | null // the ticket whose worktree is missing, waiting for a yes
  readonly confirmRecreate: () => void
  readonly cancelRecreate: () => void
  readonly error: string | null
}

// Start / Open from the Board: on success go to the ticket's tab, a warning travels with it.
export function useTicketLauncher(): TicketLauncher {
  const queryClient = useQueryClient()
  const { setWarning } = useStartWarning()
  const [recreateKey, setRecreateKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(key: string, call: () => ReturnType<typeof openTicket>): Promise<void> {
    setError(null)
    try {
      const outcome = await call()
      if ('confirmRecreate' in outcome) {
        setRecreateKey(key)
        return
      }
      if (!outcome.ok) {
        setError(errorText(outcome.error))
        return
      }
      const warning: AppError | null = outcome.warning
      setWarning(warning === null ? null : errorText(warning))
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace })
      navigateToWorkspace(key)
    } catch {
      setError(t('Could not reach the Workday server', 'Không kết nối được tới Workday server'))
    }
  }

  return {
    start: (key) => {
      void run(key, () => startTicket(key))
    },
    open: (key) => {
      void run(key, () => openTicket(key, false))
    },
    recreateKey,
    confirmRecreate: () => {
      const key = recreateKey
      setRecreateKey(null)
      if (key !== null) {
        void run(key, () => openTicket(key, true))
      }
    },
    cancelRecreate: () => {
      setRecreateKey(null)
    },
    error,
  }
}
