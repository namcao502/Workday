import { ChevronLeft } from '@gravity-ui/icons'
import { Button, Input } from '@heroui/react'
import { Fragment, useState, useSyncExternalStore } from 'react'
import { useSettings } from '../api/useSettings.js'
import { useAccess } from '../api/useMe.js'
import { t } from '../i18n.js'
import { currentHash, setHash } from '../shell/appHash.js'
import { useNarrow } from '../shell/useNarrow.js'
import { Page } from '../ui/Page.js'
import { FlatSections } from '../ui/Section.js'
import {
  searchEntries,
  settingsGroups,
  settingsLocation,
  type SettingsEntry,
} from './settingsGroups.js'
import { SettingsMenu } from './SettingsMenu.js'
import { SkeletonRows } from '../ui/Skeleton.js'

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
  }
}

// One entry per page beside a two-level menu. A phone shows the menu first and an entry on its own screen.
export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  const hash = useSyncExternalStore(subscribeToHash, currentHash)
  const narrow = useNarrow()
  const [query, setQuery] = useState('')
  const groups = settingsGroups(useAccess().mode === 'remote')
  const location = settingsLocation(groups, hash)
  const searching = query.trim() !== ''
  const entries: readonly SettingsEntry[] = searching
    ? searchEntries(groups, query)
    : [location.entry]
  const listOnly = narrow && !searching && !location.picked
  const paneShown = !narrow || searching || location.picked

  return (
    <Page
      title={t('settings.settings')}
      wide
      className="max-w-6xl"
      actions={
        <Input
          type="search"
          variant="secondary"
          className="w-56 min-w-0"
          aria-label={t('settings.searchSettings')}
          placeholder={t('settings.searchSettings')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        {narrow && !listOnly ? null : (
          <div className="shrink-0 md:sticky md:top-4 md:max-h-[calc(100vh-7rem)] md:w-56 md:overflow-y-auto">
            <SettingsMenu
              groups={groups}
              settings={settings.data}
              selectedId={searching || listOnly ? null : location.entry.id}
              asList={listOnly}
              onPick={() => {
                setQuery('')
              }}
            />
          </div>
        )}
        {paneShown ? (
          <div className="@container flex min-w-0 flex-1 flex-col gap-3">
            {narrow && !searching ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onPress={() => {
                  setHash('#/settings')
                }}
              >
                <ChevronLeft aria-hidden="true" />
                {t('settings.allSettings')}
              </Button>
            ) : null}
            {searching ? null : (
              <p className="px-1 text-xs text-muted">
                {location.group.label} / {location.entry.title}
              </p>
            )}
            {settings.data === undefined ? (
              <SkeletonRows
                label={t('settings.loading')}
                rows={2}
                className="[&>div:not(.sr-only)]:h-40"
              />
            ) : entries.length === 0 ? null : (
              // One flat pane; its sections (an entry may render several) read apart by a 1px divider.
              <FlatSections>
                <div className="flex flex-col divide-y divide-[color:var(--default)] rounded-2xl bg-surface px-5 shadow-surface">
                  {entries.map((entry) => (
                    <Fragment key={entry.id}>{entry.render(settings.data)}</Fragment>
                  ))}
                </div>
              </FlatSections>
            )}
            {searching && entries.length === 0 ? (
              <p className="text-sm text-muted" role="status">
                {t('settings.noSettingsMatch')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Page>
  )
}
