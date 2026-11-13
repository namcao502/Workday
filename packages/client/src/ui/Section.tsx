import { Card } from '@heroui/react'

interface SectionProps {
  readonly title: string
  readonly description?: string
  readonly actions?: React.ReactNode
  readonly children: React.ReactNode
}

// A card with a title row; the title is a real h2 so tests and screen readers find it.
export function Section({
  title,
  description,
  actions,
  children,
}: SectionProps): React.JSX.Element {
  return (
    <Card>
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
