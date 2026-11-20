import { Input, buttonVariants } from '@heroui/react'
import { useState, useSyncExternalStore } from 'react'
import { useSettings } from '../api/useSettings.js'
import { useAccess } from '../api/useMe.js'
import { t } from '../i18n.js'
import { currentHash } from '../shell/appHash.js'
import { Page } from '../ui/Page.js'
import {
  navigateToSettings,
  searchEntries,
  settingsGroupFromHash,
  settingsGroups,
  type SettingsEntry,
} from './settingsGroups.js'
import { SkeletonRows } from '../ui/Skeleton.js'

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
  }
}

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  const hash = useSyncExternalStore(subscribeToHash, currentHash)
  const [query, setQuery] = useState('')
  const groups = settingsGroups(useAccess().mode === 'remote')
  const groupId = settingsGroupFromHash(hash)
  const searching = query.trim() !== ''
  const entries: readonly SettingsEntry[] = searching
    ? searchEntries(groups, query)
    : (groups.find((group) => group.id === groupId)?.entries ?? [])

  return (
    <Page title={t('settings.settings')} wide className="max-w-6xl">
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <nav
          className="flex shrink-0 flex-col gap-1 md:sticky md:top-4 md:w-52"
          aria-label={t('settings.settingsGroups')}
        >
          <Input
            type="search"
            variant="secondary"
            aria-label={t('settings.searchSettings')}
            placeholder={t('settings.searchSettings')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
          {/* A row of chips that scrolls sideways on a phone; a column beside the cards from md up. */}
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
            {groups.map((group) => {
              const selected = !searching && group.id === groupId
              return (
                <button
                  key={group.id}
                  type="button"
                  className={`${buttonVariants({ variant: 'ghost' })} shrink-0 justify-start${
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
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {settings.data === undefined ? (
            <SkeletonRows
              label={t('settings.loading')}
              rows={2}
              className="[&>div:not(.sr-only)]:h-40"
            />
          ) : (
            // An entry may render several cards (Schedules: scan and jobs); they need the same gap as entries.
            entries.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-5">
                {entry.render(settings.data)}
              </div>
            ))
          )}
          {searching && entries.length === 0 ? (
            <p className="text-sm text-muted" role="status">
              {t('settings.noSettingsMatch')}
            </p>
          ) : null}
        </div>
      </div>
    </Page>
  )
}
