// One look for every row of side-by-side choices (Changes / Files / Teams, Working / Done, Source / Rendered).
export const SEGMENT_GROUP =
  'flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-surface-secondary p-0.5'

const SEGMENT = 'flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm'

export function segmentClass(selected: boolean): string {
  return selected
    ? `${SEGMENT} bg-surface shadow-sm`
    : `${SEGMENT} text-muted hover:bg-surface hover:text-foreground`
}
