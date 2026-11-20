import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { MeView } from '@workday/core'
import { createContext, useContext } from 'react'
import { queryKeys } from './client.js'
import { getMe } from './remoteApi.js'

export type AccessArea = 'board' | 'timesheet'

export interface Access {
  readonly mode: MeView['mode']
  readonly canSee: (area: AccessArea) => boolean
  readonly canAct: (area: AccessArea) => boolean
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
  return { mode: 'remote', canSee: () => true, canAct: () => true }
}

export function useMe(): UseQueryResult<MeView> {
  return useQuery({ queryKey: queryKeys.me, queryFn: getMe })
}

// App provides it once /api/me is known; without a provider (a bare page in a test) it is local.
export const AccessContext = createContext<Access>(LOCAL_ACCESS)

// Display layer only: a paired device sees and does everything; the server still refuses an unpaired one.
export function useAccess(): Access {
  return useContext(AccessContext)
}
