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
import { dbReviewIncomplete, formFromTeams, teamsFromForm, type TeamsForm } from './teamsForm.js'

const STATUS_KEY = ['teams', 'status'] as const

function statusText(configured: boolean, signedIn: boolean | null): string {
  if (!configured) {
    return t('settings.teamsIsOffNoWatchedChannels')
  }
  if (signedIn === null) {
    return t('settings.notCheckedYet')
  }
  return signedIn ? t('settings.signedInToTeams') : t('settings.signedOutOfTeams')
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
    if (dbReviewIncomplete(form)) {
      setStatus({
        ok: false,
        text: t('settings.fillBothDatabaseReviewFieldsOr'),
      })
      return
    }
    setBusy(true)
    try {
      await save({ teams: teamsFromForm(form) })
      setStatus({ ok: true, text: t('settings.saved') })
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    } catch {
      setStatus({
        ok: false,
        text: t('settings.couldNotSaveTheTeamsSettings'),
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
        text: t('settings.couldNotReachTheWorkdayServer2'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Teams">
      <TextField
        id="teams-watched-channels"
        label={t('settings.watchedChannels')}
        hint={t('settings.oneTeamChannelPerLineThe')}
        multiline
        value={form.watchedChannels}
        onChange={(value) => {
          change({ watchedChannels: value })
        }}
      />
      <TextField
        id="teams-lead-name"
        label={t('settings.leadName')}
        hint={t('settings.greetedInANewPostWhen')}
        value={form.postLeadName}
        onChange={(value) => {
          change({ postLeadName: value })
        }}
      />
      <TextField
        id="teams-greeting"
        label={t('settings.greetingTemplate')}
        hint={t('settings.isTheLeadName')}
        value={form.postGreeting}
        onChange={(value) => {
          change({ postGreeting: value })
        }}
      />
      <TextField
        id="teams-db-review-team"
        label={t('settings.databaseReviewTeam')}
        hint={t('settings.whereSchemaChangesGoForApproval')}
        value={form.dbReviewTeam}
        onChange={(value) => {
          change({ dbReviewTeam: value })
        }}
      />
      <TextField
        id="teams-db-review-channel"
        label={t('settings.databaseReviewChannel')}
        hint={t('settings.mustAlsoBeOneOfThe')}
        value={form.dbReviewChannel}
        onChange={(value) => {
          change({ dbReviewChannel: value })
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
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            void runSignIn()
          }}
        >
          {t('settings.signInToTeams')}
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
