import { ChartColumn, Clock, Gear, ListCheck, Terminal } from '@gravity-ui/icons'
import type { PageId } from './pages.js'

const ICON_SIZE = 22

export function PageIcon({ page }: { readonly page: PageId }): React.JSX.Element {
  switch (page) {
    case 'tickets':
      return <ListCheck width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
    case 'workspace':
      return <Terminal width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
    case 'timesheet':
      return <Clock width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
    case 'insights':
      return <ChartColumn width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
    case 'settings':
      return <Gear width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
  }
}
