import { Chip } from '@heroui/react'

interface KeyPillProps {
  readonly ticketKey: string
  readonly url: string
}

export function KeyPill({ ticketKey, url }: KeyPillProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="key-pill-button cursor-pointer whitespace-nowrap rounded-full hover:opacity-80"
      onClick={() => {
        window.open(url, '_blank', 'noopener')
      }}
    >
      <Chip
        size="lg"
        color="accent"
        className="key-pill whitespace-nowrap px-3 text-sm font-medium"
      >
        {ticketKey}
      </Chip>
    </button>
  )
}
