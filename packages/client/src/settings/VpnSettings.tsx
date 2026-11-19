import type { VpnConfig, VpnStatusView } from '@workday/core'
import { Button, ComboBox, Input, Label, ListBox, Switch } from '@heroui/react'
import { useState } from 'react'
import { openRemoteFirewall } from '../api/remoteApi.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { CopyButton } from '../ui/CopyButton.js'
import { TextField } from '../ui/TextField.js'
import type { VpnForm } from './vpnForm.js'

interface VpnSettingsProps {
  readonly form: VpnForm
  readonly onChange: (changes: Partial<VpnForm>) => void
  readonly saved: VpnConfig | null
  readonly status: VpnStatusView | undefined
  readonly problem: string | null
}

function StatusLine({ status }: { readonly status: VpnStatusView }): React.JSX.Element | null {
  if (status.server === 'running') {
    return (
      <p className="text-sm">
        {t('settings.listeningAt')} {status.httpsUrl}
      </p>
    )
  }
  if (status.server === 'failed') {
    return <p className="text-sm text-danger">{status.serverDetail}</p>
  }
  return (
    <p className="text-sm text-muted">
      {status.server === 'starting' ? t('settings.vpnStarting') : t('settings.vpnOff')}
    </p>
  )
}

function FirewallRow({ saved }: { readonly saved: VpnConfig | null }): React.JSX.Element {
  const [result, setResult] = useState<string | null>(null)
  const ready = saved !== null && saved.allowedRanges.length !== 0

  async function open(): Promise<void> {
    try {
      const outcome = await openRemoteFirewall()
      if (outcome.ok) {
        setResult(t('settings.firewallRuleAdded'))
      } else if (outcome.error.code === 'firewallCancelled') {
        setResult(t('settings.cancelled'))
      } else {
        setResult(errorText(outcome.error))
      }
    } catch {
      setResult(t('settings.couldNotReachTheWorkdayServer2'))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        isDisabled={!ready}
        onPress={() => {
          void open()
        }}
      >
        {t('settings.openFirewall')}
      </Button>
      <span className="text-sm text-muted">{result ?? t('settings.saveTheIpRangesFirst')}</span>
    </div>
  )
}

export function VpnSettings({
  form,
  onChange,
  saved,
  status,
  problem,
}: VpnSettingsProps): React.JSX.Element {
  const addresses = status?.addresses ?? []
  return (
    <>
      <h3 className="text-sm font-semibold">{t('settings.vpnAccess')}</h3>
      <Switch
        isSelected={form.enabled}
        onChange={(selected) => {
          onChange({ enabled: selected })
        }}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {t('settings.allowAccessOverTheVpn')}
        </Switch.Content>
      </Switch>
      <ComboBox
        fullWidth
        allowsCustomValue
        inputValue={form.address}
        onInputChange={(value) => {
          onChange({ address: value })
        }}
      >
        <Label>{t('settings.pcAddressOnTheVpn')}</Label>
        <ComboBox.InputGroup>
          <Input id="vpn-address" variant="secondary" placeholder="10.20.30.40" />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover>
          <ListBox>
            {addresses.map((address) => (
              <ListBox.Item key={address} id={address} textValue={address}>
                {address}
              </ListBox.Item>
            ))}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          id="vpn-https-port"
          label={t('settings.httpsPort')}
          hint={t('settings.theAppAndItsApi')}
          value={form.httpsPort}
          onChange={(value) => {
            onChange({ httpsPort: value })
          }}
        />
        <TextField
          id="vpn-setup-port"
          label={t('settings.setupPort')}
          hint={t('settings.plainHttpOnlyForPairing')}
          value={form.setupPort}
          onChange={(value) => {
            onChange({ setupPort: value })
          }}
        />
      </div>
      <TextField
        id="vpn-ranges"
        label={t('settings.allowedIpRanges')}
        hint={t('settings.oneIpv4RangePerLineE')}
        value={form.allowedRanges}
        multiline
        onChange={(value) => {
          onChange({ allowedRanges: value })
        }}
      />
      {problem === null ? null : (
        <p className="text-sm text-danger" role="alert">
          {problem}
        </p>
      )}
      {status === undefined ? null : <StatusLine status={status} />}
      {status?.caFingerprint == null ? null : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{t('settings.caFingerprint')}</span>
          <code className="break-all font-mono text-xs">{status.caFingerprint}</code>
          <CopyButton text={status.caFingerprint} />
        </div>
      )}
      <FirewallRow saved={saved} />
    </>
  )
}
