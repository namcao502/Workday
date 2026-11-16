import { CopyButton } from './CopyButton.js'

interface CopyBlockProps {
  readonly text: string
  readonly children: React.ReactNode
}

// A block of code or quoted text with a copy button in its corner, shown on hover or focus.
export function CopyBlock({ text, children }: CopyBlockProps): React.JSX.Element {
  return (
    <div className="group relative">
      {children}
      <CopyButton
        text={text}
        className="absolute right-1 top-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
    </div>
  )
}
