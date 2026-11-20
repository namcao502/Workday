import type { SettingsView } from '@workday/core'
import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useRemote } from '../api/useRemote.js'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { vpnFormOf, vpnFromForm, type VpnForm } from './vpnForm.js'
import { VpnSettings } from './VpnSettings.js'

function VpnBody({ settings }: { readonly settings: SettingsView }): React.JSX.Element {
  const save = useSaveSettings()
  const remote = useRemote()
  const [form, setForm] = useState<VpnForm>(() => vpnFormOf(settings.config.vpn, []))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ readonly ok: boolean; readonly text: string } | null>(
    null,
  )

  // The address list arrives with the status, after the form is built; prefill only an unsaved, blank form.
  const firstAddress = remote.data?.vpn.addresses[0]
  useEffect(() => {
    if (settings.config.vpn === null && firstAddress !== undefined) {
      setForm((current) =>
        current.address === '' ? { ...current, address: firstAddress } : current,
      )
    }
  }, [settings.config.vpn, firstAddress])

  function change(changes: Partial<VpnForm>): void {
    setForm((current) => ({ ...current, ...changes }))
    setProblem(null)
  }

  async function runSave(): Promise<void> {
    const checked = vpnFromForm(form)
    if ('problem' in checked) {
      setProblem(checked.problem)
      return
    }
    setBusy(true)
    try {
      await save({ vpn: checked.vpn })
      setMessage({ ok: true, text: t('settings.saved') })
    } catch {
      setMessage({ ok: false, text: t('settings.couldNotReachTheWorkdayServer2') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t('settings.vpnAccess')}>
      <VpnSettings
        form={form}
        onChange={change}
        saved={settings.config.vpn}
        status={remote.data?.vpn}
        problem={problem}
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
    </Section>
  )
}

// Only the PC itself manages remote access; a paired device never sees this block.
export function VpnSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element | null {
  const access = useAccess()
  return access.mode === 'local' ? <VpnBody settings={settings} /> : null
}
