import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { allows, type MeView, type RemoteArea } from '@workday/core'
import { createContext, useContext } from 'react'
import { queryKeys } from './client.js'
import { getMe } from './remoteApi.js'

export interface Access {
  readonly mode: MeView['mode']
  readonly canSee: (area: RemoteArea) => boolean
  readonly canAct: (area: RemoteArea) => boolean
}

export const LOCAL_ACCESS: Access = {
  mode: 'local',
  canSee: () => true,
  canAct: () => true,
}

export function accessFor(me: MeView): Access {
  if (me.mode === 'local') {
    return LOCAL_ACCESS
  }
  if (me.mode === 'unpaired') {
    return { mode: 'unpaired', canSee: () => false, canAct: () => false }
  }
  const { rights } = me.device
  return {
    mode: 'remote',
    canSee: (area) => allows(rights, area, 'view'),
    canAct: (area) => allows(rights, area, 'act'),
  }
}

export function useMe(): UseQueryResult<MeView> {
  return useQuery({ queryKey: queryKeys.me, queryFn: getMe })
}

// App provides it once /api/me is known; without a provider (a bare page in a test) it is local.
export const AccessContext = createContext<Access>(LOCAL_ACCESS)

// Display layer only: the server refuses what a device may not do.
export function useAccess(): Access {
  return useContext(AccessContext)
}
