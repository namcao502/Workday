import { useEffect, useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { ticketUpdateFromHash } from '../shell/pages.js'
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
    // A system notification opens "#/tickets?update=KEY"; the query goes so a reload does not reopen it.
    function openFromHash(): void {
      const key = ticketUpdateFromHash(window.location.hash)
      if (key !== null) {
        window.history.replaceState(null, '', window.location.hash.split('?')[0])
        setTicketKey(key)
      }
    }
    openFromHash()
    window.addEventListener(OPEN_EVENT, open)
    window.addEventListener('hashchange', openFromHash)
    return () => {
      window.removeEventListener(OPEN_EVENT, open)
      window.removeEventListener('hashchange', openFromHash)
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
