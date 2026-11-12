import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { SettingsUpdate, SettingsView } from '@workday/core'
import { getSettings, queryKeys, saveSettings } from './client.js'

export function useSettings(): UseQueryResult<SettingsView> {
  return useQuery({ queryKey: queryKeys.settings, queryFn: getSettings })
}

// Puts the saved view straight into the cache so theme and language apply at once.
export function useSaveSettings(): (update: SettingsUpdate) => Promise<SettingsView> {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (view) => {
      queryClient.setQueryData(queryKeys.settings, view)
    },
  })
  return mutation.mutateAsync
}
