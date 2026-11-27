import type { SettingsView } from '@workday/core'
import { ChevronRight } from '@gravity-ui/icons'
import { buttonVariants } from '@heroui/react'
import { t } from '../i18n.js'
import {
  navigateToSettings,
  type EntryStatus,
  type SettingsEntryId,
  type SettingsGroup,
} from './settingsGroups.js'

interface SettingsMenuProps {
  readonly groups: readonly SettingsGroup[]
  readonly settings: SettingsView | undefined
  readonly selectedId: SettingsEntryId | null // null = nothing highlighted (searching, or the phone's list)
  readonly asList: boolean // the phone's first screen: full-width rows with a chevron
  readonly onPick: () => void
}

function StatusDot({ status }: { readonly status: EntryStatus }): React.JSX.Element {
  return (
    <span
      className={`size-2 flex-none rounded-full ${status === 'on' ? 'bg-success' : 'bg-default-foreground/25'}`}
      role="img"
      aria-label={status === 'on' ? t('settings.statusOn') : t('settings.statusOff')}
    />
  )
}

// Every group as a small heading over its entries; an entry that connects to something shows whether it is on.
export function SettingsMenu({
  groups,
  settings,
  selectedId,
  asList,
  onPick,
}: SettingsMenuProps): React.JSX.Element {
  return (
    <nav className="flex flex-col gap-3" aria-label={t('settings.settingsGroups')}>
      {groups.map((group) => (
        <div
          key={group.id}
          className="flex flex-col gap-0.5"
          role="group"
          aria-labelledby={`settings-group-${group.id}`}
        >
          <p
            id={`settings-group-${group.id}`}
            className="px-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase"
          >
            {group.label}
          </p>
          {group.entries.map((entry) => {
            const selected = entry.id === selectedId
            const status = settings === undefined ? undefined : entry.status?.(settings)
            return (
              <button
                key={entry.id}
                type="button"
                className={`${buttonVariants({ variant: 'ghost', size: asList ? 'md' : 'sm' })} press-flat w-full justify-start gap-2${
                  selected ? ' bg-accent-soft text-accent' : ''
                }`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  onPick()
                  navigateToSettings(entry.id)
                }}
              >
                <span className="min-w-0 flex-1 truncate text-left">{entry.title}</span>
                {status === undefined ? null : <StatusDot status={status} />}
                {asList ? <ChevronRight className="size-4 text-muted" aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
