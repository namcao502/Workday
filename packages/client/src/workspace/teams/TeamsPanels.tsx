import { Button, Header, ListBox, Select } from '@heroui/react'
import type { TeamsOption, TeamsReadView } from '@workday/core'
import { t } from '../../i18n.js'
import { navigateTo } from '../../shell/pages.js'

function optionLabel(option: TeamsOption): string {
  return option.posted ? option.label : `${option.label} ${t('teams.notPosted')}`
}

function UnreadDot({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <span
      className="ml-1.5 size-2 flex-none self-center rounded-full bg-danger"
      role="img"
      aria-label={label}
    />
  )
}

// Channels first, then the ticket's group chats; a dot marks each one with a message waiting.
export function ConversationSelect({
  options,
  value,
  pending,
  onChange,
}: {
  readonly options: readonly TeamsOption[]
  readonly value: string
  readonly pending: readonly string[] // conversation ids with a message waiting for me
  readonly onChange: (id: string) => void
}): React.JSX.Element {
  const channels = options.filter((option) => option.kind === 'channel')
  const chats = options.filter((option) => option.kind === 'chat')
  const waiting = new Set(pending)
  // The open conversation is marked seen as it shows, so only another one needs the hint.
  const otherWaiting = options.some((option) => option.id !== value && waiting.has(option.id))
  const item = (option: TeamsOption): React.JSX.Element => (
    <ListBox.Item key={option.id} id={option.id} textValue={optionLabel(option)}>
      {optionLabel(option)}
      {waiting.has(option.id) ? <UnreadDot label={t('teams.unread')} /> : null}
      <ListBox.ItemIndicator />
    </ListBox.Item>
  )
  return (
    <Select
      aria-label={t('teams.conversation')}
      // At least 16rem before the buttons beside it wrap below, so a phone never squeezes it to a column.
      className="min-w-0 max-w-full flex-1 basis-64"
      value={value}
      onChange={(key) => {
        if (key !== null) {
          onChange(String(key))
        }
      }}
    >
      <Select.Trigger>
        <Select.Value />
        {otherWaiting ? <UnreadDot label={t('teams.unreadInAnotherConversation')} /> : null}
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {channels.map(item)}
          {chats.length === 0 ? null : (
            <ListBox.Section>
              <Header>{t('teams.chats')}</Header>
              {chats.map(item)}
            </ListBox.Section>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

// The label of the reply / post button (Task 7) for the shown conversation.
export function composeLabel(view: TeamsReadView, selected: TeamsOption | undefined): string {
  const name = selected?.label ?? ''
  if (view.state === 'notPosted') {
    return t('teams.newPost', { name })
  }
  if (selected?.kind === 'chat') {
    return t('teams.chat', { name })
  }
  return t('teams.post', { name })
}

export function optionsOf(view: TeamsReadView): readonly TeamsOption[] {
  return 'options' in view ? view.options : []
}

export function shownConversationId(view: TeamsReadView): string {
  if (view.state === 'thread') {
    return view.conversationId
  }
  return view.state === 'notPosted' ? view.channelId : ''
}

export function StatePanel({
  view,
  writing,
  onSignIn,
}: {
  readonly view: TeamsReadView
  readonly writing: boolean
  readonly onSignIn: () => void
}): React.JSX.Element | null {
  switch (view.state) {
    case 'signedOut':
      return (
        <div className="flex flex-col items-start gap-2 py-3">
          <p>{t('teams.youAreSignedOutOfTeams')}</p>
          <Button variant="primary" size="sm" isDisabled={writing} onPress={onSignIn}>
            {t('teams.signInToTeams')}
          </Button>
        </div>
      )
    case 'notConfigured':
      return (
        <div className="flex flex-col items-start gap-2 py-3">
          <p>{t('teams.teamsIsNotSetUp')}</p>
          <Button
            variant="primary"
            size="sm"
            onPress={() => {
              navigateTo('settings')
            }}
          >
            {t('teams.openSettingsTeams')}
          </Button>
        </div>
      )
    case 'searching':
      return <p className="py-3 text-sm text-muted">{t('teams.lookingForAnOlderPost')}</p>
    case 'notPosted':
      return <p className="py-3 text-sm text-muted">{t('teams.thisTicketHasNoPostHere')}</p>
    case 'thread':
      return null
  }
}
