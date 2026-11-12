import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { RemoteStatusView } from '@workday/core'
import { queryKeys } from './client.js'
import {
  decidePairing,
  getRemote,
  openPairing,
  revokeDevice,
  sendDeviceTestPush,
  updateDevice,
  type DeviceChanges,
} from './remoteSettingsApi.js'

// Refetched on a remote.changed event (see useEvents).
export function useRemote(): UseQueryResult<RemoteStatusView> {
  return useQuery({ queryKey: queryKeys.remote, queryFn: getRemote })
}

export interface RemoteActions {
  readonly openPairing: () => Promise<void>
  readonly decidePairing: (decision: 'approve' | 'reject') => Promise<void>
  readonly updateDevice: (id: string, changes: DeviceChanges) => Promise<void>
  readonly revokeDevice: (id: string) => Promise<void>
  readonly sendTestPush: (id: string) => Promise<boolean>
}

// Each call puts the returned status in the cache so the page follows at once.
export function useRemoteActions(): RemoteActions {
  const queryClient = useQueryClient()

  function store(view: RemoteStatusView): void {
    queryClient.setQueryData(queryKeys.remote, view)
  }

  return {
    openPairing: async () => {
      await openPairing()
      await queryClient.invalidateQueries({ queryKey: queryKeys.remote })
    },
    decidePairing: async (decision) => {
      store(await decidePairing(decision))
    },
    updateDevice: async (id, changes) => {
      store(await updateDevice(id, changes))
    },
    revokeDevice: async (id) => {
      store(await revokeDevice(id))
    },
    sendTestPush: sendDeviceTestPush,
  }
}
