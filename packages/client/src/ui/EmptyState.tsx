import { Button, Card } from '@heroui/react'

interface EmptyStateProps {
  readonly icon: React.ReactNode
  readonly message: string
  readonly action?: { readonly label: string; readonly onPress: () => void }
}

// A page with nothing to show: a quiet card with an icon, one line, and the step that fixes it.
export function EmptyState({ icon, message, action }: EmptyStateProps): React.JSX.Element {
  return (
    <Card className="animate-fade-in">
      <Card.Content className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-secondary text-muted [&>svg]:size-6">
          {icon}
        </span>
        <p className="text-sm text-muted">{message}</p>
        {action === undefined ? null : (
          <Button variant="primary" onPress={action.onPress}>
            {action.label}
          </Button>
        )}
      </Card.Content>
    </Card>
  )
}
