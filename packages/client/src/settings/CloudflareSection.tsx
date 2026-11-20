import type { RemoteStatusView, SettingsView } from '@workday/core'
import { Button, Switch } from '@heroui/react'
import { useState } from 'react'
import { useRemote } from '../api/useRemote.js'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'
import { Tip } from '../ui/Tip.js'
import { formFromRemote, remoteFromForm, type RemoteForm } from './remoteForm.js'
import { TokenField } from './TokenField.js'

function tunnelText(status: RemoteStatusView): string {
  switch (status.tunnel) {
    case 'off':
      return t('settings.tunnelOff')
    case 'starting':
      return t('settings.tunnelStarting')
    case 'running':
      return t('settings.tunnelRunning')
    case 'failed':
      return t('settings.tunnelFailed')
  }
}

function CloudflareBody({ settings }: { readonly settings: SettingsView }): React.JSX.Element {
  const save = useSaveSettings()
  const remote = useRemote()
  const [form, setForm] = useState<RemoteForm>(() => formFromRemote(settings.config.remote))
  const [tunnelToken, setTunnelToken] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ readonly ok: boolean; readonly text: string } | null>(
    null,
  )

  function change(changes: Partial<RemoteForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  async function runSave(): Promise<void> {
    setBusy(true)
    try {
      const token = tunnelToken.trim()
      await save({
        remote: remoteFromForm(form),
        ...(token === '' ? {} : { tunnelToken: token }),
      })
      setTunnelToken('')
      setReplacing(false)
      setMessage({ ok: true, text: t('settings.saved') })
    } catch {
      setMessage({ ok: false, text: t('settings.couldNotReachTheWorkdayServer2') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Cloudflare">
      <Switch
        isSelected={form.enabled}
        onChange={(selected) => {
          change({ enabled: selected })
        }}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {t('settings.allowRemoteAccess')}
        </Switch.Content>
      </Switch>
      <TextField
        id="remote-public-host"
        label={t('settings.publicHost')}
        hint={t('settings.pointTheTunnelSPublicHostname')}
        placeholder="workday.example.com"
        value={form.publicHost}
        onChange={(value) => {
          change({ publicHost: value })
        }}
      />
      <TextField
        id="remote-access-team"
        label={t('settings.accessTeamDomain')}
        hint={t('settings.theCloudflareAccessTeamDomain')}
        placeholder="myteam.cloudflareaccess.com"
        value={form.accessTeamDomain}
        onChange={(value) => {
          change({ accessTeamDomain: value })
        }}
      />
      <TextField
        id="remote-access-aud"
        label={t('settings.accessAudTag')}
        hint={t('settings.shownOnTheAccessApplication')}
        value={form.accessAud}
        onChange={(value) => {
          change({ accessAud: value })
        }}
      />
      <TextField
        id="remote-cloudflared-path"
        label={t('settings.cloudflaredPath')}
        hint={t('settings.leaveEmptyToRunCloudflaredYourself')}
        value={form.cloudflaredPath}
        onChange={(value) => {
          change({ cloudflaredPath: value })
        }}
      />
      <TokenField
        id="remote-tunnel-token"
        label={t('settings.tunnelToken')}
        envText={t('settings.setByWorkdayTunnelToken')}
        helpText={t('settings.handedToCloudflaredThroughTheEnvironment')}
        source={settings.tunnelTokenSource}
        replacing={replacing}
        value={tunnelToken}
        onChange={setTunnelToken}
        onReplace={() => {
          setReplacing(true)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            void runSave()
          }}
        >
          {t('settings.save')}
        </Button>
      </div>
      {message === null ? null : (
        <p className={message.ok ? 'text-sm text-success' : 'text-sm text-danger'} role="status">
          {message.text}
        </p>
      )}
      {remote.data === undefined ? null : (
        <p className={remote.data.tunnel === 'failed' ? 'text-sm text-danger' : 'status'}>
          <Tip content={remote.data.tunnelDetail}>{tunnelText(remote.data)}</Tip>
        </p>
      )}
    </Section>
  )
}

export function CloudflareSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  return <CloudflareBody settings={settings} />
}
