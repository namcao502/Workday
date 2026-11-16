import { ChartColumn, Clock, Gear, ListCheck, Terminal } from '@gravity-ui/icons'
import type { PageId } from './pages.js'

interface PageIconProps {
  readonly page: PageId
  // A size class: the button styles force 1rem on any svg, so width and height attributes would lose.
  readonly className?: string
}

export function PageIcon({ page, className = 'size-5' }: PageIconProps): React.JSX.Element {
  switch (page) {
    case 'tickets':
      return <ListCheck className={className} aria-hidden="true" />
    case 'workspace':
      return <Terminal className={className} aria-hidden="true" />
    case 'timesheet':
      return <Clock className={className} aria-hidden="true" />
    case 'insights':
      return <ChartColumn className={className} aria-hidden="true" />
    case 'settings':
      return <Gear className={className} aria-hidden="true" />
  }
}
