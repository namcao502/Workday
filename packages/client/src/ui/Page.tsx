import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { useNarrow } from '../shell/useNarrow.js'
import { HeaderSlotContext } from './HeaderSlot.js'

interface PageProps {
  readonly title: string
  readonly actions?: React.ReactNode // right of the title
  readonly wide?: boolean // Board / Insights tables use the full width
  readonly phoneActionsBelow?: boolean // actions too wide for a phone's top bar go to a row under it
  readonly className?: string
  readonly children: React.ReactNode
}

interface PageHeadingProps {
  readonly title: string
  readonly actions?: React.ReactNode
  readonly phoneActionsBelow?: boolean
}

// The title and actions sit in the TopBar next to the menu button when the shell provides a slot,
// else on a row of the page body. phoneActionsBelow keeps only the title up there on a phone.
export function PageHeading({
  title,
  actions,
  phoneActionsBelow = false,
}: PageHeadingProps): React.JSX.Element {
  const slot = useContext(HeaderSlotContext)
  const narrow = useNarrow()
  const titleElement = (
    <h1 className="shrink-0 truncate text-2xl font-semibold tracking-tight">{title}</h1>
  )
  if (slot === null) {
    return (
      <div className="flex items-center justify-between gap-3">
        {titleElement}
        {actions}
      </div>
    )
  }
  if (phoneActionsBelow && narrow) {
    return (
      <>
        {createPortal(titleElement, slot)}
        {actions}
      </>
    )
  }
  return createPortal(
    <>
      {titleElement}
      {actions}
    </>,
    slot,
  )
}

// A page body: a column of blocks under its heading.
export function Page({
  title,
  actions,
  wide,
  phoneActionsBelow,
  className,
  children,
}: PageProps): React.JSX.Element {
  const classes = [
    // pt-1 keeps a focused field's 2px outset ring off the scroll container's top edge, which clips it.
    'mx-auto flex w-full flex-col gap-5 px-6 pb-8 pt-1',
    wide === true ? '' : 'max-w-4xl',
    className ?? '',
  ]
  return (
    <section className={classes.filter((c) => c !== '').join(' ')}>
      <PageHeading title={title} actions={actions} phoneActionsBelow={phoneActionsBelow ?? false} />
      {children}
    </section>
  )
}
