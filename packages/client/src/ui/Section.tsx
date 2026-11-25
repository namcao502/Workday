import { Card } from '@heroui/react'
import { createContext, useContext } from 'react'

interface SectionProps {
  readonly title: string
  readonly description?: string
  readonly actions?: React.ReactNode
  readonly children: React.ReactNode
}

// When true, Section renders as a flat block (no card surface) so a parent pane can separate sections
// with 1px dividers instead. Off by default: a lone Section still draws its own card.
const SectionFlatContext = createContext(false)

export function FlatSections({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <SectionFlatContext.Provider value={true}>{children}</SectionFlatContext.Provider>
}

// A section with a title row; the title is a real h2 so tests and screen readers find it. Inside a
// FlatSections pane it drops the card surface and relies on the pane's divider for separation.
export function Section({
  title,
  description,
  actions,
  children,
}: SectionProps): React.JSX.Element {
  const flat = useContext(SectionFlatContext)

  if (flat) {
    return (
      <section className="animate-fade-in flex flex-col gap-3 py-5">
        <div className="flex flex-row items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {description === undefined ? null : (
              <p className="text-sm text-muted">{description}</p>
            )}
          </div>
          {actions}
        </div>
        {children}
      </section>
    )
  }

  return (
    <Card className="animate-fade-in">
      <Card.Header className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title className="text-base font-semibold" render={(props) => <h2 {...props} />}>
            {title}
          </Card.Title>
          {description === undefined ? null : <Card.Description>{description}</Card.Description>}
        </div>
        {actions}
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">{children}</Card.Content>
    </Card>
  )
}
