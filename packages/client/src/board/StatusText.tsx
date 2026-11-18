interface StatusTextProps {
  readonly status: string
  readonly statusCategory: string | null
}

// Jira's own category key ("new" / "indeterminate" / "done"), so no workflow status name lives in code.
export function statusColor(statusCategory: string | null): string {
  switch (statusCategory?.toLowerCase()) {
    case 'new':
      return 'text-muted'
    case 'indeterminate':
      return 'text-accent'
    case 'done':
      return 'text-success'
    default:
      return ''
  }
}

export function StatusText({ status, statusCategory }: StatusTextProps): React.JSX.Element {
  return <span className={statusColor(statusCategory)}>{status}</span>
}
