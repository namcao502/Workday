import type { SettingsView } from '@workday/core'
import { useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useRemote, useRemoteActions } from '../api/useRemote.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { RemoteActivity } from './RemoteActivity.js'
import { RemoteDevices, type RunRemote } from './RemoteDevices.js'
import { RemotePairing } from './RemotePairing.js'

// Pairing, the paired devices and their activity; VPN and Cloudflare have their own cards.
function RemoteBody({ settings }: { readonly settings: SettingsView }): React.JSX.Element {
  const remote = useRemote()
  const actions = useRemoteActions()
  const [failed, setFailed] = useState(false)

  const run: RunRemote = (action) => {
    setFailed(false)
    action().catch(() => {
      setFailed(true)
    })
  }

  const { language, timeZone } = settings.config
  return (
    <Section title={t('settings.devices')}>
      {failed ? (
        <p className="text-sm text-danger" role="status">
          {t('settings.couldNotReachTheWorkdayServer2')}
        </p>
      ) : null}
      {remote.data === undefined ? null : (
        <>
          <RemotePairing
            pairing={remote.data.pairing}
            remote={settings.config.remote}
            vpn={remote.data.vpn}
            actions={actions}
            run={run}
          />
          <RemoteDevices
            devices={remote.data.devices}
            actions={actions}
            run={run}
            language={language}
            timeZone={timeZone}
          />
          <RemoteActivity activity={remote.data.activity} language={language} timeZone={timeZone} />
        </>
      )}
    </Section>
  )
}

// Only the PC itself manages remote access; a paired device never sees this block.
export function RemoteSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element | null {
  const access = useAccess()
  return access.mode === 'local' ? <RemoteBody settings={settings} /> : null
}
