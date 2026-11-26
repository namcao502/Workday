import { useIsFetching, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  ChangeGroupView,
  ChatView,
  DiffView,
  FileContentView,
  FilesGroupView,
  PastChat,
  WorkspaceView,
} from '@workday/core'
import { useEffect, useMemo, useRef } from 'react'
import { queryKeys } from './client.js'
import {
  addSession,
  addTerminal,
  closeSession,
  closeTab,
  getChanges,
  getChat,
  getDiff,
  getFileContent,
  getFiles,
  getPastChats,
  getWorkspace,
  markSeen,
  moveTab,
} from './workspaceApi.js'

const CHAT_STALE_MS = 30_000
const CHAT_KEEP_MS = 30 * 60_000

// Refetch on workspace.changed is in useEvents.
export function useWorkspace(): UseQueryResult<WorkspaceView> {
  return useQuery({
    queryKey: queryKeys.workspace,
    queryFn: getWorkspace,
    staleTime: CHAT_STALE_MS,
  })
}

export interface WorkspaceActions {
  readonly addTerminal: (folder: string | null) => Promise<void>
  readonly closeTab: (id: string) => Promise<void>
  readonly moveTab: (id: string, index: number) => Promise<void>
  readonly addSession: (tabId: string) => Promise<void>
  readonly closeSession: (name: string) => Promise<void>
  readonly markSeen: (name: string) => Promise<void>
}

// Each call refetches the view itself, so the UI does not wait for the workspace.changed event.
export function useWorkspaceActions(): WorkspaceActions {
  const queryClient = useQueryClient()
  return useMemo(() => {
    function then<Args extends readonly unknown[]>(
      action: (...args: Args) => Promise<void>,
    ): (...args: Args) => Promise<void> {
      return async (...args) => {
        await action(...args)
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspace })
      }
    }
    return {
      addTerminal: then(addTerminal),
      closeTab: then(closeTab),
      moveTab: then(moveTab),
      addSession: then(addSession),
      closeSession: then(closeSession),
      markSeen: then(markSeen),
    }
  }, [queryClient])
}

// A start warning (main not merged) outlives the page that raised it: the Board starts, the Workspace shows it.
export function useStartWarning(): {
  readonly warning: string | null
  readonly setWarning: (text: string | null) => void
} {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: queryKeys.workspaceWarning,
    queryFn: () => Promise.resolve<string | null>(null),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return {
    warning: data ?? null,
    setWarning: (text) => {
      queryClient.setQueryData(queryKeys.workspaceWarning, text)
    },
  }
}

// A separate key root from `workspace`, so a session change does not reread every file.
export function useChanges(tabId: string): UseQueryResult<readonly ChangeGroupView[]> {
  return useQuery({
    queryKey: ['workspace-files', tabId, 'changes'],
    queryFn: () => getChanges(tabId),
  })
}

export function useDiff(tabId: string, group: string, path: string): UseQueryResult<DiffView> {
  return useQuery({
    queryKey: ['workspace-files', tabId, 'diff', group, path],
    queryFn: () => getDiff(tabId, group, path),
  })
}

// Rereads everything shown for the tab's files (the lists and the open diff or file), not just one list:
// a refreshed list beside a stale diff looked like the refresh had not worked.
export function useRefreshTabFiles(tabId: string): {
  readonly refresh: () => Promise<void>
  readonly refreshing: boolean
} {
  const queryClient = useQueryClient()
  const refreshing = useIsFetching({ queryKey: ['workspace-files', tabId] }) !== 0
  return {
    refresh: () => queryClient.invalidateQueries({ queryKey: ['workspace-files', tabId] }),
    refreshing,
  }
}

// When a Claude turn ends the files it edited are worth rereading: the changes, the open diff and file.
export function useRefreshFilesAfterTurn(tabId: string, working: boolean): void {
  const queryClient = useQueryClient()
  const wasWorking = useRef(working)
  useEffect(() => {
    if (wasWorking.current && !working) {
      void queryClient.invalidateQueries({ queryKey: ['workspace-files', tabId] })
    }
    wasWorking.current = working
  }, [working, tabId, queryClient])
}

export function useFiles(tabId: string): UseQueryResult<readonly FilesGroupView[]> {
  return useQuery({ queryKey: ['workspace-files', tabId, 'files'], queryFn: () => getFiles(tabId) })
}

// The @file menu reads the file list only once a "@" is typed.
export function useFilePaths(tabId: string, enabled: boolean): readonly string[] {
  const { data } = useQuery({
    queryKey: ['workspace-files', tabId, 'files'],
    queryFn: () => getFiles(tabId),
    enabled,
  })
  return (data ?? []).flatMap((group) => group.paths)
}

export function useFileContent(
  tabId: string,
  group: string,
  path: string,
): UseQueryResult<FileContentView> {
  return useQuery({
    queryKey: ['workspace-files', tabId, 'content', group, path],
    queryFn: () => getFileContent(tabId, group, path),
  })
}

// Under the `workspace` key root, so a workspace.changed event refetches an open chat at once.
// Read each time the /resume list opens: a chat may have been written since.
export function usePastChats(
  session: string,
  enabled: boolean,
): UseQueryResult<readonly PastChat[]> {
  return useQuery({
    queryKey: ['workspace', 'past-chats', session],
    queryFn: () => getPastChats(session),
    enabled,
    staleTime: 0,
  })
}

export function chatKey(session: string): readonly string[] {
  return ['workspace', 'chat', session]
}

// Refetched by the chat.changed event, not polled; only the shown session asks.
export function useChat(session: string, active: boolean): UseQueryResult<ChatView> {
  // Kept a while after the page is left, so coming back shows the chat at once instead of "Loading".
  return useQuery({
    queryKey: chatKey(session),
    queryFn: () => getChat(session),
    enabled: active,
    staleTime: CHAT_STALE_MS,
    gcTime: CHAT_KEEP_MS,
  })
}
