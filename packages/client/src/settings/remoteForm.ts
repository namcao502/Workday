import type { RemoteConfig } from '@workday/core'

export interface RemoteForm {
  readonly enabled: boolean
  readonly publicHost: string
  readonly accessTeamDomain: string
  readonly accessAud: string
  readonly cloudflaredPath: string
}

export function formFromRemote(remote: RemoteConfig | null): RemoteForm {
  return {
    enabled: remote?.enabled ?? false,
    publicHost: remote?.publicHost ?? '',
    accessTeamDomain: remote?.accessTeamDomain ?? '',
    accessAud: remote?.accessAud ?? '',
    cloudflaredPath: remote?.cloudflaredPath ?? '',
  }
}

// A group with every text field empty is sent as null (not configured).
export function remoteFromForm(form: RemoteForm): RemoteConfig | null {
  const publicHost = form.publicHost.trim()
  const accessTeamDomain = form.accessTeamDomain.trim()
  const accessAud = form.accessAud.trim()
  const cloudflaredPath = form.cloudflaredPath.trim()
  if (publicHost === '' && accessTeamDomain === '' && accessAud === '' && cloudflaredPath === '') {
    return null
  }
  return {
    enabled: form.enabled,
    publicHost,
    accessTeamDomain,
    accessAud,
    cloudflaredPath: cloudflaredPath === '' ? null : cloudflaredPath,
  }
}
