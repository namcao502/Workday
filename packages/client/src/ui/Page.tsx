import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { HeaderSlotContext } from './HeaderSlot.js'

interface PageProps {
  readonly title: string
  readonly actions?: React.ReactNode // right of the title
  readonly wide?: boolean // Board / Insights tables use the full width
  readonly className?: string
  readonly children: React.ReactNode
}

interface PageHeadingProps {
  readonly title: string
  readonly actions?: React.ReactNode
}

// The title and actions sit in the TopBar next to the menu button when the shell provides a slot,
// else on a row of the page body.
export function PageHeading({ title, actions }: PageHeadingProps): React.JSX.Element {
  const slot = useContext(HeaderSlotContext)
  const heading = (
    <>
      <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
      {actions}
    </>
  )
  return slot === null ? (
    <div className="flex items-center justify-between gap-3">{heading}</div>
  ) : (
    createPortal(heading, slot)
  )
}

// A page body: a column of blocks under its heading.
export function Page({ title, actions, wide, className, children }: PageProps): React.JSX.Element {
  const classes = [
    'mx-auto flex w-full flex-col gap-5 px-6 pb-8',
    wide === true ? '' : 'max-w-4xl',
    className ?? '',
  ]
  return (
    <section className={classes.filter((c) => c !== '').join(' ')}>
      <PageHeading title={title} actions={actions} />
      {children}
    </section>
  )
}
