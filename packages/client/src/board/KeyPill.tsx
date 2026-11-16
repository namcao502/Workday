import { Chip } from '@heroui/react'

interface KeyPillProps {
  readonly ticketKey: string
  readonly url: string
}

export function KeyPill({ ticketKey, url }: KeyPillProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="cursor-pointer whitespace-nowrap rounded-full hover:opacity-80"
      onClick={() => {
        window.open(url, '_blank', 'noopener')
      }}
    >
      <Chip size="sm" color="accent" className="whitespace-nowrap">
        {ticketKey}
      </Chip>
    </button>
  )
}
