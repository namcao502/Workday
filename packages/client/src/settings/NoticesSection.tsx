import {
  noticeChannels,
  type NoticeChannels,
  type NoticePrefs,
  type NoticeTopic,
  type SettingsView,
} from '@workday/core'
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
import { requestNoticePermission } from '../workspace/useClaudeNotices.js'

const CHANNELS: readonly (keyof NoticeChannels)[] = ['toast', 'desktop', 'phone']

function topicName(topic: NoticeTopic): string {
  switch (topic) {
    case 'claude':
      return 'Claude'
    case 'pr':
      return t('Pull requests', 'Pull request')
    case 'jira':
      return 'Jira'
    case 'teams':
      return 'Teams'
    case 'teamsMention':
      return t('Teams mentions', 'Teams nhắc đến bạn')
    case 'suggestions':
      return t('Suggestions', 'Gợi ý')
    case 'knowledge':
      return t('Knowledge scan', 'Quét knowledge')
    case 'other':
      return t('Other', 'Khác')
  }
}

function channelName(channel: keyof NoticeChannels): string {
  switch (channel) {
    case 'toast':
      return t('Toast', 'Toast')
    case 'desktop':
      return t('Desktop', 'Desktop')
    case 'phone':
      return t('Phone', 'Điện thoại')
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
      <button
        type="button"
        className="wd-button secondary"
        aria-pressed={state === 'on'}
        onClick={() => {
          void toggle()
        }}
      >
        {state === 'on'
          ? t('Stop notifying when Workday is closed', 'Thôi thông báo khi đã đóng Workday')
          : t('Notify even when Workday is closed', 'Thông báo cả khi đã đóng Workday')}
      </button>
      {state === 'denied' ? (
        <p className="status danger" role="status">
          {t(
            'The browser blocked notifications; allow them in the site settings.',
            'Trình duyệt đã chặn thông báo; hãy cho phép trong cài đặt trang.',
          )}
        </p>
      ) : null}
      {state === 'failed' ? (
        <p className="status danger" role="status">
          {t('Could not change the setting', 'Không đổi được cài đặt')}
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

  return (
    <section className="section">
      <h2 className="section-title">{t('Notices', 'Thông báo')}</h2>
      <p className="field-hint">
        {t(
          'The bell keeps every notice; these choose what also pops up.',
          'Chuông luôn giữ mọi thông báo; đây là chọn cái nào hiện thêm.',
        )}
      </p>
      <table className="notice-prefs">
        <thead>
          <tr>
            <th scope="col">{t('Topic', 'Chủ đề')}</th>
            {CHANNELS.map((channel) => (
              <th key={channel} scope="col">
                {channelName(channel)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TOPICS.map((topic) => (
            <tr key={topic}>
              <th scope="row">{topicName(topic)}</th>
              {CHANNELS.map((channel) => (
                <td key={channel}>
                  <input
                    type="checkbox"
                    aria-label={`${topicName(topic)}: ${channelName(channel)}`}
                    checked={channels[topic][channel]}
                    onChange={(event) => {
                      toggle(topic, channel, event.target.checked)
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        <button
          type="button"
          className="wd-button secondary"
          onClick={() => {
            void apply(channelsFromPrefs({}), {})
          }}
        >
          {t('Restore defaults', 'Khôi phục mặc định')}
        </button>
        {askPermission ? (
          <button type="button" className="wd-button secondary" onClick={requestNoticePermission}>
            {t('Allow desktop notifications', 'Cho phép thông báo desktop')}
          </button>
        ) : null}
        {local && pushSupported() ? <ClosedWindowToggle /> : null}
      </div>
      {failed ? (
        <p className="status danger" role="status">
          {t('Could not save the notice settings', 'Không lưu được cài đặt thông báo')}
        </p>
      ) : null}
    </section>
  )
}
