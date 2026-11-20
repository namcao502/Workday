interface SkeletonProps {
  readonly className?: string
}

interface SkeletonRowsProps {
  readonly label: string // read by screen readers in place of the bars
  readonly rows?: number
  readonly className?: string
}

const ROW_WIDTHS: readonly string[] = ['w-full', 'w-5/6', 'w-2/3', 'w-3/4']

export function Skeleton({ className = '' }: SkeletonProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-default motion-reduce:animate-none ${className}`}
    />
  )
}

// Stacked bars of varying width; the label keeps the loading text for screen readers.
export function SkeletonRows({
  label,
  rows = 3,
  className = '',
}: SkeletonRowsProps): React.JSX.Element {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className={`h-4 ${ROW_WIDTHS[index % ROW_WIDTHS.length] ?? 'w-full'}`}
        />
      ))}
    </div>
  )
}
