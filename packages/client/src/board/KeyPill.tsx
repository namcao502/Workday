interface KeyPillProps {
  readonly ticketKey: string
  readonly url: string
}

export function KeyPill({ ticketKey, url }: KeyPillProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="pill key-pill"
      onClick={() => {
        window.open(url, '_blank', 'noopener')
      }}
    >
      {ticketKey}
    </button>
  )
}
