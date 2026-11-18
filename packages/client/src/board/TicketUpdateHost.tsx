import { useEffect, useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { TicketUpdateDialog } from './TicketUpdateDialog.js'

const OPEN_EVENT = 'workday:ticket-update'

// Opens a ticket's Jira comparison over the current page, as the C# app does from its notice.
export function openTicketUpdate(key: string): void {
  window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: key }))
}

// Mounted once in the shell, so a notice can open the comparison from any page.
export function TicketUpdateHost(): React.JSX.Element | null {
  const access = useAccess()
  const [ticketKey, setTicketKey] = useState<string | null>(null)

  useEffect(() => {
    function open(event: Event): void {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        setTicketKey(event.detail)
      }
    }
    window.addEventListener(OPEN_EVENT, open)
    return () => {
      window.removeEventListener(OPEN_EVENT, open)
    }
  }, [])

  if (ticketKey === null) {
    return null
  }
  return (
    <TicketUpdateDialog
      key={ticketKey}
      ticketKey={ticketKey}
      canAct={access.canAct('board')}
      onClose={() => {
        setTicketKey(null)
      }}
    />
  )
}
