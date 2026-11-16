import { Input, buttonVariants } from '@heroui/react'
import { useState, useSyncExternalStore } from 'react'
import { useSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { Page } from '../ui/Page.js'
import {
  navigateToSettings,
  searchEntries,
  settingsGroupFromHash,
  settingsGroups,
  type SettingsEntry,
} from './settingsGroups.js'

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
  }
}

function currentHash(): string {
  return window.location.hash
}

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  const hash = useSyncExternalStore(subscribeToHash, currentHash)
  const [query, setQuery] = useState('')
  const groups = settingsGroups()
  const groupId = settingsGroupFromHash(hash)
  const searching = query.trim() !== ''
  const entries: readonly SettingsEntry[] = searching
    ? searchEntries(groups, query)
    : (groups.find((group) => group.id === groupId)?.entries ?? [])

  return (
    <Page title={t('Settings', 'Cài đặt')} wide className="max-w-6xl">
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <nav
          className="flex shrink-0 flex-col gap-1 md:w-52"
          aria-label={t('Settings groups', 'Nhóm cài đặt')}
        >
          <Input
            type="search"
            variant="secondary"
            aria-label={t('Search settings', 'Tìm trong cài đặt')}
            placeholder={t('Search settings', 'Tìm trong cài đặt')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
          {groups.map((group) => {
            const selected = !searching && group.id === groupId
            return (
              <button
                key={group.id}
                type="button"
                className={`${buttonVariants({ variant: 'ghost' })} justify-start${
                  selected ? ' bg-accent-soft text-accent' : ''
                }`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  setQuery('')
                  navigateToSettings(group.id)
                }}
              >
                {group.label}
              </button>
            )
          })}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {settings.data === undefined ? (
            <p className="text-sm text-muted">{t('Loading...', 'Đang tải...')}</p>
          ) : (
            entries.map((entry) => <div key={entry.id}>{entry.render(settings.data)}</div>)
          )}
          {searching && entries.length === 0 ? (
            <p className="text-sm text-muted" role="status">
              {t('No settings match', 'Không có cài đặt nào khớp')}
            </p>
          ) : null}
        </div>
      </div>
    </Page>
  )
}
