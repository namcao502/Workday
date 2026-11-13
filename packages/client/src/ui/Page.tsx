interface PageProps {
  readonly title: string
  readonly actions?: React.ReactNode // right of the title
  readonly wide?: boolean // Board / Insights tables use the full width
  readonly className?: string
  readonly children: React.ReactNode
}

// A page body under the TopBar: title + a column of blocks.
export function Page({ title, actions, wide, className, children }: PageProps): React.JSX.Element {
  const classes = [
    'mx-auto flex w-full flex-col gap-5 px-6 pb-8',
    wide === true ? '' : 'max-w-4xl',
    className ?? '',
  ]
  return (
    <section className={classes.filter((c) => c !== '').join(' ')}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {actions}
      </div>
      {children}
    </section>
  )
}
