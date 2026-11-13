import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  ChangeGroupView,
  ChatView,
  DiffView,
  FileContentView,
  FilesGroupView,
  WorkspaceView,
} from '@workday/core'
import { useMemo } from 'react'
import { queryKeys } from './client.js'
import { useSettings } from './useSettings.js'
import { useAccess } from './useMe.js'
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
  getWorkspace,
  markSeen,
} from './workspaceApi.js'

// The Workspace is local-only, so a remote device never asks for it. Refetch on workspace.changed is in useEvents.
export function useWorkspace(): UseQueryResult<WorkspaceView> {
  const local = useAccess().mode === 'local'
  return useQuery({ queryKey: queryKeys.workspace, queryFn: getWorkspace, enabled: local })
}

export interface WorkspaceActions {
  readonly addTerminal: (folder: string | null) => Promise<void>
  readonly closeTab: (id: string) => Promise<void>
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

export function useFiles(tabId: string): UseQueryResult<readonly FilesGroupView[]> {
  return useQuery({ queryKey: ['workspace-files', tabId, 'files'], queryFn: () => getFiles(tabId) })
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
export function chatKey(session: string): readonly string[] {
  return ['workspace', 'chat', session]
}

// Polled once a second, and only while the Chat is showing.
export function useChat(session: string, active: boolean): UseQueryResult<ChatView> {
  return useQuery({
    queryKey: chatKey(session),
    queryFn: () => getChat(session),
    enabled: active,
    refetchInterval: active ? 1000 : false,
  })
}

export function useChatViewEnabled(): boolean {
  const config = useSettings().data?.config
  return config?.workspace.chatView === true
}
