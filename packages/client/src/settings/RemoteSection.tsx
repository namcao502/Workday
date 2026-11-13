import type { RemoteStatusView, SettingsView } from '@workday/core'
import { Button, Switch } from '@heroui/react'
import { useState } from 'react'
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

function tunnelText(status: RemoteStatusView): string {
  switch (status.tunnel) {
    case 'off':
      return t('Tunnel off', 'Tunnel tắt')
    case 'starting':
      return t('Tunnel starting', 'Tunnel đang khởi động')
    case 'running':
      return t('Tunnel running', 'Tunnel đang chạy')
    case 'failed':
      return t('Tunnel failed', 'Tunnel lỗi')
  }
}

function RemoteBody({ settings }: { readonly settings: SettingsView }): React.JSX.Element {
  const save = useSaveSettings()
  const remote = useRemote()
  const actions = useRemoteActions()
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

  const run: RunRemote = (action) => {
    action().catch(() => {
      setMessage({
        ok: false,
        text: t('Could not reach the Workday server', 'Không kết nối được tới Workday server'),
      })
    })
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
      setMessage({ ok: true, text: t('Saved', 'Đã lưu') })
    } catch {
      setMessage({
        ok: false,
        text: t('Could not reach the Workday server', 'Không kết nối được tới Workday server'),
      })
    } finally {
      setBusy(false)
    }
  }

  const { language, timeZone } = settings.config
  return (
    <Section title={t('Remote access', 'Truy cập từ xa')}>
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
          {t('Allow remote access', 'Cho phép truy cập từ xa')}
        </Switch.Content>
      </Switch>
      <TextField
        id="remote-public-host"
        label={t('Public host', 'Public host')}
        hint={t(
          "Point the tunnel's public hostname at http://127.0.0.1:<port> and protect it with a Cloudflare Access application.",
          'Trỏ public hostname của tunnel về http://127.0.0.1:<port> và bảo vệ nó bằng một ứng dụng Cloudflare Access.',
        )}
        placeholder="workday.example.com"
        value={form.publicHost}
        onChange={(value) => {
          change({ publicHost: value })
        }}
      />
      <TextField
        id="remote-access-team"
        label={t('Access team domain', 'Team domain của Access')}
        hint={t('The Cloudflare Access team domain', 'Team domain của Cloudflare Access')}
        placeholder="myteam.cloudflareaccess.com"
        value={form.accessTeamDomain}
        onChange={(value) => {
          change({ accessTeamDomain: value })
        }}
      />
      <TextField
        id="remote-access-aud"
        label={t('Access AUD tag', 'AUD tag của Access')}
        hint={t('Shown on the Access application', 'Hiện trên ứng dụng Access')}
        value={form.accessAud}
        onChange={(value) => {
          change({ accessAud: value })
        }}
      />
      <TextField
        id="remote-cloudflared-path"
        label={t('cloudflared path', 'Đường dẫn cloudflared')}
        hint={t(
          'Leave empty to run cloudflared yourself, outside the app',
          'Để trống nếu tự chạy cloudflared ngoài app',
        )}
        value={form.cloudflaredPath}
        onChange={(value) => {
          change({ cloudflaredPath: value })
        }}
      />
      <TokenField
        id="remote-tunnel-token"
        label={t('Tunnel token', 'Tunnel token')}
        envText={t('Set by WORKDAY_TUNNEL_TOKEN', 'Được đặt bởi WORKDAY_TUNNEL_TOKEN')}
        helpText={t(
          'Handed to cloudflared through the environment.',
          'Được đưa cho cloudflared qua biến môi trường.',
        )}
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
          {t('Save', 'Lưu')}
        </Button>
      </div>
      {message === null ? null : (
        <p className={message.ok ? 'text-sm text-success' : 'text-sm text-danger'} role="status">
          {message.text}
        </p>
      )}
      {remote.data === undefined ? null : (
        <>
          <p
            className={remote.data.tunnel === 'failed' ? 'text-sm text-danger' : 'status'}
            title={remote.data.tunnelDetail ?? undefined}
          >
            {tunnelText(remote.data)}
          </p>
          <RemotePairing
            pairing={remote.data.pairing}
            remote={settings.config.remote}
            actions={actions}
            run={run}
          />
          <h3 className="text-sm font-semibold">{t('Devices', 'Thiết bị')}</h3>
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
