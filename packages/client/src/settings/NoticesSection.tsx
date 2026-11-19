import {
  noticeChannels,
  type NoticeChannels,
  type NoticePrefs,
  type NoticeTopic,
  type SettingsView,
} from '@workday/core'
import { Button, Switch } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import {
  localPushActive,
  pushSupported,
  subscribeLocalPush,
  unsubscribeLocalPush,
} from '../remote/pushSubscription.js'
import { Section } from '../ui/Section.js'
import { requestNoticePermission } from '../workspace/useClaudeNotices.js'

const CHANNELS: readonly (keyof NoticeChannels)[] = ['toast', 'desktop', 'phone']

function topicName(topic: NoticeTopic): string {
  switch (topic) {
    case 'claude':
      return 'Claude'
    case 'pr':
      return t('settings.pullRequests')
    case 'jira':
      return 'Jira'
    case 'teams':
      return 'Teams'
    case 'teamsMention':
      return t('settings.teamsMentions')
    case 'suggestions':
      return t('settings.suggestions')
    case 'knowledge':
      return t('settings.knowledgeScan')
    case 'log':
      return t('settings.autoLog')
    case 'other':
      return t('settings.other')
  }
}

function channelName(channel: keyof NoticeChannels): string {
  switch (channel) {
    case 'toast':
      return t('settings.toast')
    case 'desktop':
      return t('settings.desktop')
    case 'phone':
      return t('settings.phone')
  }
}

const TOPICS: readonly NoticeTopic[] = [
  'claude',
  'pr',
  'jira',
  'teams',
  'teamsMention',
  'suggestions',
  'knowledge',
  'log',
  'other',
]

// Keeps only the channels that differ from the topic's default, so a later default change still applies.
export function prefsFromChannels(
  channels: Readonly<Record<NoticeTopic, NoticeChannels>>,
): NoticePrefs {
  const prefs: Partial<Record<NoticeTopic, Partial<NoticeChannels>>> = {}
  for (const topic of TOPICS) {
    const defaults = noticeChannels(topic, {})
    const changed = Object.fromEntries(
      CHANNELS.filter((channel) => channels[topic][channel] !== defaults[channel]).map(
        (channel) => [channel, channels[topic][channel]],
      ),
    ) as Partial<NoticeChannels>
    if (Object.keys(changed).length !== 0) {
      prefs[topic] = changed
    }
  }
  return prefs
}

function channelsFromPrefs(prefs: NoticePrefs): Record<NoticeTopic, NoticeChannels> {
  return {
    claude: noticeChannels('claude', prefs),
    pr: noticeChannels('pr', prefs),
    jira: noticeChannels('jira', prefs),
    teams: noticeChannels('teams', prefs),
    teamsMention: noticeChannels('teamsMention', prefs),
    suggestions: noticeChannels('suggestions', prefs),
    knowledge: noticeChannels('knowledge', prefs),
    log: noticeChannels('log', prefs),
    other: noticeChannels('other', prefs),
  }
}

type ClosedWindowState = 'off' | 'on' | 'denied' | 'failed'

// Desktop notices through the browser's push service: shown even when the Workday window is closed.
function ClosedWindowToggle(): React.JSX.Element {
  const [state, setState] = useState<ClosedWindowState>('off')

  useEffect(() => {
    void localPushActive().then((active) => {
      setState(active ? 'on' : 'off')
    })
  }, [])

  async function toggle(): Promise<void> {
    try {
      if (state === 'on') {
        await unsubscribeLocalPush()
        setState('off')
      } else {
        setState((await subscribeLocalPush()) === 'subscribed' ? 'on' : 'denied')
      }
    } catch {
      setState('failed')
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={state === 'on'}
        onPress={() => {
          void toggle()
        }}
      >
        {state === 'on'
          ? t('settings.stopNotifyingWhenWorkdayIsClosed')
          : t('settings.notifyEvenWhenWorkdayIsClosed')}
      </Button>
      {state === 'denied' ? (
        <p className="text-sm text-danger" role="status">
          {t('settings.theBrowserBlockedNotificationsAllowThem')}
        </p>
      ) : null}
      {state === 'failed' ? (
        <p className="text-sm text-danger" role="status">
          {t('settings.couldNotChangeTheSetting')}
        </p>
      ) : null}
    </>
  )
}

export function NoticesSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const [channels, setChannels] = useState(() => channelsFromPrefs(settings.config.notices))
  const [failed, setFailed] = useState(false)
  const local = useAccess().mode === 'local'
  const askPermission = typeof Notification !== 'undefined' && Notification.permission === 'default'

  async function apply(
    next: Record<NoticeTopic, NoticeChannels>,
    prefs: NoticePrefs,
  ): Promise<void> {
    setChannels(next)
    try {
      await save({ notices: prefs })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  function toggle(topic: NoticeTopic, channel: keyof NoticeChannels, on: boolean): void {
    const next = { ...channels, [topic]: { ...channels[topic], [channel]: on } }
    void apply(next, prefsFromChannels(next))
  }

  // One switch per column header: every topic on that channel at once.
  function toggleColumn(channel: keyof NoticeChannels, on: boolean): void {
    const next = Object.fromEntries(
      TOPICS.map((topic) => [topic, { ...channels[topic], [channel]: on }]),
    ) as Record<NoticeTopic, NoticeChannels>
    void apply(next, prefsFromChannels(next))
  }

  return (
    <Section title={t('settings.notices')}>
      <p className="text-sm text-muted">{t('settings.theBellKeepsEveryNoticeThese')}</p>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className="py-1 text-left text-xs font-medium uppercase text-muted">
              {t('settings.topic')}
            </th>
            {CHANNELS.map((channel) => (
              <th
                key={channel}
                scope="col"
                className="w-28 py-1 text-center text-xs font-medium uppercase text-muted"
              >
                <div className="flex flex-col items-center gap-1">
                  {channelName(channel)}
                  <Switch
                    size="sm"
                    isSelected={TOPICS.every((topic) => channels[topic][channel])}
                    onChange={(selected) => {
                      toggleColumn(channel, selected)
                    }}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <span className="sr-only">
                        {t('settings.allTopics', { channel: channelName(channel) })}
                      </span>
                    </Switch.Content>
                  </Switch>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TOPICS.map((topic) => (
            <tr key={topic}>
              <th scope="row" className="py-2 text-left font-normal">
                {topicName(topic)}
              </th>
              {CHANNELS.map((channel) => (
                <td key={channel} className="w-28 py-2">
                  <div className="flex justify-center">
                    <Switch
                      size="lg"
                      isSelected={channels[topic][channel]}
                      onChange={(selected) => {
                        toggle(topic, channel, selected)
                      }}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                        <span className="sr-only">{`${topicName(topic)}: ${channelName(channel)}`}</span>
                      </Switch.Content>
                    </Switch>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onPress={() => {
            void apply(channelsFromPrefs({}), {})
          }}
        >
          {t('settings.restoreDefaults')}
        </Button>
        {askPermission ? (
          <Button variant="secondary" size="sm" onPress={requestNoticePermission}>
            {t('settings.allowDesktopNotifications')}
          </Button>
        ) : null}
        {local && pushSupported() ? <ClosedWindowToggle /> : null}
      </div>
      {failed ? (
        <p className="text-sm text-danger" role="status">
          {t('settings.couldNotSaveTheNoticeSettings')}
        </p>
      ) : null}
    </Section>
  )
}
