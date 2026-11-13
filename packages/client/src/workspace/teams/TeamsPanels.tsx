import { Button, Header, ListBox, Select } from '@heroui/react'
import type { TeamsOption, TeamsReadView } from '@workday/core'
import { t } from '../../i18n.js'
import { navigateTo } from '../../shell/pages.js'

function optionLabel(option: TeamsOption): string {
  return option.posted ? option.label : `${option.label} ${t('(not posted)', '(chưa đăng)')}`
}

// Channels first, then the ticket's group chats.
export function ConversationSelect({
  options,
  value,
  onChange,
}: {
  readonly options: readonly TeamsOption[]
  readonly value: string
  readonly onChange: (id: string) => void
}): React.JSX.Element {
  const channels = options.filter((option) => option.kind === 'channel')
  const chats = options.filter((option) => option.kind === 'chat')
  return (
    <Select
      aria-label={t('Conversation', 'Hội thoại')}
      className="min-w-0 max-w-full"
      value={value}
      onChange={(key) => {
        if (key !== null) {
          onChange(String(key))
        }
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {channels.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={optionLabel(option)}>
              {optionLabel(option)}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
          {chats.length === 0 ? null : (
            <ListBox.Section>
              <Header>{t('Chats', 'Trò chuyện')}</Header>
              {chats.map((option) => (
                <ListBox.Item key={option.id} id={option.id} textValue={optionLabel(option)}>
                  {optionLabel(option)}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
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
    return t(`New post: ${name}`, `Bài mới: ${name}`)
  }
  if (selected?.kind === 'chat') {
    return t(`Chat: ${name}`, `Trò chuyện: ${name}`)
  }
  return t(`Post: ${name}`, `Bài đăng: ${name}`)
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
          <p>{t('You are signed out of Teams.', 'Bạn chưa đăng nhập Teams.')}</p>
          <Button variant="primary" size="sm" isDisabled={writing} onPress={onSignIn}>
            {t('Sign in to Teams', 'Đăng nhập Teams')}
          </Button>
        </div>
      )
    case 'notConfigured':
      return (
        <div className="flex flex-col items-start gap-2 py-3">
          <p>{t('Teams is not set up.', 'Chưa cấu hình Teams.')}</p>
          <Button
            variant="primary"
            size="sm"
            onPress={() => {
              navigateTo('settings')
            }}
          >
            {t('Open Settings > Teams', 'Mở Cài đặt > Teams')}
          </Button>
        </div>
      )
    case 'searching':
      return (
        <p className="py-3 text-sm text-muted">
          {t('Looking for an older post...', 'Đang tìm bài đăng cũ hơn...')}
        </p>
      )
    case 'notPosted':
      return (
        <p className="py-3 text-sm text-muted">
          {t('This ticket has no post here yet.', 'Ticket này chưa có bài đăng ở đây.')}
        </p>
      )
    case 'thread':
      return null
  }
}
