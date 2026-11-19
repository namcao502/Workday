import type { RemoteStatusView, SettingsView } from '@workday/core'
import { Button, Switch } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useRemote, useRemoteActions } from '../api/useRemote.js'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { RemoteActivity } from './RemoteActivity.js'
import { RemoteDevices, type RunRemote } from './RemoteDevices.js'
import { RemotePairing } from './RemotePairing.js'
import { formFromRemote, remoteFromForm, type RemoteForm } from './remoteForm.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'
import { TokenField } from './TokenField.js'
import { vpnFormOf, vpnFromForm, type VpnForm } from './vpnForm.js'
import { VpnSettings } from './VpnSettings.js'
import { Tip } from '../ui/Tip.js'

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

function RemoteBody({ settings }: { readonly settings: SettingsView }): React.JSX.Element {
  const save = useSaveSettings()
  const remote = useRemote()
  const actions = useRemoteActions()
  const [form, setForm] = useState<RemoteForm>(() => formFromRemote(settings.config.remote))
  const [vpnForm, setVpnForm] = useState<VpnForm>(() => vpnFormOf(settings.config.vpn, []))
  const [vpnProblem, setVpnProblem] = useState<string | null>(null)
  const [tunnelToken, setTunnelToken] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ readonly ok: boolean; readonly text: string } | null>(
    null,
  )

  // The address list arrives with the status, after the form is built; prefill only an unsaved, blank form.
  const firstAddress = remote.data?.vpn.addresses[0]
  useEffect(() => {
    if (settings.config.vpn === null && firstAddress !== undefined) {
      setVpnForm((current) =>
        current.address === '' ? { ...current, address: firstAddress } : current,
      )
    }
  }, [settings.config.vpn, firstAddress])

  function change(changes: Partial<RemoteForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  function changeVpn(changes: Partial<VpnForm>): void {
    setVpnForm((current) => ({ ...current, ...changes }))
    setVpnProblem(null)
  }

  const run: RunRemote = (action) => {
    action().catch(() => {
      setMessage({
        ok: false,
        text: t('settings.couldNotReachTheWorkdayServer2'),
      })
    })
  }

  async function runSave(): Promise<void> {
    const checked = vpnFromForm(vpnForm)
    if ('problem' in checked) {
      setVpnProblem(checked.problem)
      return
    }
    setBusy(true)
    try {
      const token = tunnelToken.trim()
      await save({
        remote: remoteFromForm(form),
        vpn: checked.vpn,
        ...(token === '' ? {} : { tunnelToken: token }),
      })
      setTunnelToken('')
      setReplacing(false)
      setMessage({ ok: true, text: t('settings.saved') })
    } catch {
      setMessage({
        ok: false,
        text: t('settings.couldNotReachTheWorkdayServer2'),
      })
    } finally {
      setBusy(false)
    }
  }

  const { language, timeZone } = settings.config
  return (
    <Section title={t('settings.remoteAccess')}>
      <VpnSettings
        form={vpnForm}
        onChange={changeVpn}
        saved={settings.config.vpn}
        status={remote.data?.vpn}
        problem={vpnProblem}
      />
      <h3 className="text-sm font-semibold">Cloudflare</h3>
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
        <>
          <p className={remote.data.tunnel === 'failed' ? 'text-sm text-danger' : 'status'}>
            <Tip content={remote.data.tunnelDetail}>{tunnelText(remote.data)}</Tip>
          </p>
          <RemotePairing
            pairing={remote.data.pairing}
            remote={settings.config.remote}
            vpn={remote.data.vpn}
            actions={actions}
            run={run}
          />
          <h3 className="text-sm font-semibold">{t('settings.devices')}</h3>
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
