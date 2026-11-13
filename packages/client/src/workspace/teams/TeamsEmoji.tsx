import { emojiUrl } from '@workday/core'
import { useState } from 'react'

// The CDN image of a reaction; when it cannot load, the key stands in.
export function TeamsEmoji({ reaction }: { readonly reaction: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className="text-xs">{reaction}</span>
  }
  return (
    <img
      className="size-4"
      src={emojiUrl(reaction)}
      alt={reaction}
      onError={() => {
        setFailed(true)
      }}
    />
  )
}
