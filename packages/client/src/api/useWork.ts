import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { ReadyToTestOutcome, TakeOutcome, WorkView } from '@workday/core'
import { useMemo } from 'react'
import { ApiError, queryKeys } from './client.js'
import { useAccess } from './useMe.js'
import { useSettings } from './useSettings.js'
import {
  getWork,
  hideReview,
  hideSuggestion,
  markCommentsSeen,
  moveToReadyToTest,
  takeSuggestion,
} from './workApi.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'

// Refetch on work.changed / board.changed / workspace.changed is in useEvents.
export function useWork(): UseQueryResult<WorkView> {
  const canSee = useAccess().canSee('board')
  return useQuery({ queryKey: queryKeys.work, queryFn: getWork, enabled: canSee })
}

// The repo labels live in settings, which a remote device cannot read: it falls back to the repo name.
export function useRepoLabels(): Readonly<Record<string, string>> {
  const labels = useSettings().data?.config.azureDevOps?.repoLabels
  return labels ?? {}
}

export function actionErrorText(error: unknown): string {
  if (error instanceof ApiError && error.code !== null) {
    return errorText({ code: error.code })
  }
  return t('Could not reach the Workday server', 'Không kết nối được tới Workday server')
}

export interface WorkActions {
  readonly readyToTest: (key: string) => Promise<ReadyToTestOutcome>
  readonly commentsSeen: (key: string) => Promise<void>
  readonly hideReview: (repository: string, pullRequestId: number) => Promise<void>
  readonly take: (key: string) => Promise<TakeOutcome>
  readonly hideSuggestion: (key: string) => Promise<void>
}

// Each call refetches the view itself, so the UI does not wait for the work.changed event.
export function useWorkActions(): WorkActions {
  const queryClient = useQueryClient()
  return useMemo(() => {
    async function refetched<Result>(result: Promise<Result>): Promise<Result> {
      const outcome = await result
      await queryClient.invalidateQueries({ queryKey: queryKeys.work })
      return outcome
    }
    return {
      readyToTest: (key) => refetched(moveToReadyToTest(key)),
      commentsSeen: (key) => refetched(markCommentsSeen(key)),
      hideReview: (repository, id) => refetched(hideReview(repository, id)),
      take: (key) => refetched(takeSuggestion(key)),
      hideSuggestion: (key) => refetched(hideSuggestion(key)),
    }
  }, [queryClient])
}
