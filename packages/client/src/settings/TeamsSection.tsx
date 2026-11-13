import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SettingsView } from '@workday/core'
import { Button } from '@heroui/react'
import { useState } from 'react'
import { getTeamsStatus, teamsSignIn } from '../api/teamsApi.js'
import { useSaveSettings } from '../api/useSettings.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'
import { formFromTeams, teamsFromForm, type TeamsForm } from './teamsForm.js'

const STATUS_KEY = ['teams', 'status'] as const

function statusText(configured: boolean, signedIn: boolean | null): string {
  if (!configured) {
    return t('Teams is off: no watched channels.', 'Teams đang tắt: chưa có kênh theo dõi.')
  }
  if (signedIn === null) {
    return t('Not checked yet.', 'Chưa kiểm tra.')
  }
  return signedIn
    ? t('Signed in to Teams.', 'Đã đăng nhập Teams.')
    : t('Signed out of Teams.', 'Chưa đăng nhập Teams.')
}

export function TeamsSection({ settings }: { readonly settings: SettingsView }): React.JSX.Element {
  const save = useSaveSettings()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<TeamsForm>(() => formFromTeams(settings.config.teams))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ readonly ok: boolean; readonly text: string } | null>(null)
  const teamsStatus = useQuery({ queryKey: STATUS_KEY, queryFn: getTeamsStatus })

  function change(changes: Partial<TeamsForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  async function runSave(): Promise<void> {
    setBusy(true)
    try {
      await save({ teams: teamsFromForm(form) })
      setStatus({ ok: true, text: t('Saved', 'Đã lưu') })
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    } catch {
      setStatus({
        ok: false,
        text: t('Could not save the Teams settings', 'Không lưu được cài đặt Teams'),
      })
    } finally {
      setBusy(false)
    }
  }

  async function runSignIn(): Promise<void> {
    setBusy(true)
    try {
      const result = await teamsSignIn()
      setStatus(result.ok ? null : { ok: false, text: errorText(result.error) })
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    } catch {
      setStatus({
        ok: false,
        text: t('Could not reach the Workday server', 'Không kết nối được tới Workday server'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Teams">
      <TextField
        id="teams-watched-channels"
        label={t('Watched channels', 'Kênh theo dõi')}
        hint={t(
          'One "Team > Channel" per line. The first is where new posts go. Empty = Teams off',
          'Mỗi dòng một "Team > Channel". Dòng đầu là nơi đăng bài mới. Để trống = tắt Teams',
        )}
        rows={4}
        value={form.watchedChannels}
        onChange={(value) => {
          change({ watchedChannels: value })
        }}
      />
      <TextField
        id="teams-lead-name"
        label={t('Lead name', 'Tên lead')}
        hint={t(
          'Greeted in a new post when this name is found among the people',
          'Được chào trong bài mới khi tìm thấy tên này trong danh sách người',
        )}
        value={form.postLeadName}
        onChange={(value) => {
          change({ postLeadName: value })
        }}
      />
      <TextField
        id="teams-greeting"
        label={t('Greeting template', 'Mẫu lời chào')}
        hint={t('{lead} is the lead name', '{lead} là tên lead')}
        value={form.postGreeting}
        onChange={(value) => {
          change({ postGreeting: value })
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
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            void runSignIn()
          }}
        >
          {t('Sign in to Teams', 'Đăng nhập Teams')}
        </Button>
      </div>
      {teamsStatus.data === undefined ? null : (
        <p className="text-sm text-muted">
          {statusText(teamsStatus.data.configured, teamsStatus.data.signedIn)}
        </p>
      )}
      {status === null ? null : (
        <p className={status.ok ? 'text-sm text-success' : 'text-sm text-danger'} role="status">
          {status.text}
        </p>
      )}
    </Section>
  )
}
