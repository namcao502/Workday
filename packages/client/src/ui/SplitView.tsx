import { useRef } from 'react'
import { t } from '../i18n.js'
import { MAX_SHARE, MIN_SHARE, type SplitHidden } from './useStoredSplit.js'
import { Tip } from './Tip.js'

const HANDLE_PX = 12
const KEY_STEP = 0.02

interface SplitViewProps {
  readonly share: number // the left pane's fraction of the width
  readonly onShareChange: (share: number | null) => void // null = back to the default
  readonly hidden: SplitHidden
  readonly left: React.ReactNode
  readonly right: React.ReactNode
  readonly minPx: number // the narrowest either pane may get while both show
  readonly className?: string
}

// Two panes side by side with a draggable handle between them (the WPF SplitPanes): drag or use the arrow keys
// to resize, double-click to go back to the default. A hidden pane gives its room to the other.
export function SplitView({
  share,
  onShareChange,
  hidden,
  left,
  right,
  minPx,
  className = '',
}: SplitViewProps): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function clamp(value: number, width: number): number {
    const edge = width > 0 ? minPx / width : MIN_SHARE
    return Math.min(Math.max(value, Math.max(MIN_SHARE, edge)), Math.min(MAX_SHARE, 1 - edge))
  }

  function dragTo(clientX: number): void {
    const box = container.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) {
      return
    }
    onShareChange(clamp((clientX - box.left) / box.width, box.width))
  }

  function nudge(delta: number): void {
    const width = container.current?.getBoundingClientRect().width ?? 0
    onShareChange(clamp(share + delta, width))
  }

  const split = hidden === 'none'
  return (
    <div ref={container} className={`flex min-h-0 min-w-0 ${className}`}>
      <div
        className={`min-h-0 min-w-0 ${hidden === 'left' ? 'hidden' : 'flex flex-col'}`}
        style={
          split
            ? { flex: `0 0 calc(${String(share * 100)}% - ${String(HANDLE_PX / 2)}px)` }
            : { flex: '1 1 0' }
        }
      >
        {left}
      </div>
      {split ? (
        <Tip
          className="flex shrink-0"
          content={t(
            'Drag to resize (double-click: back to the default width)',
            'Kéo để đổi độ rộng (nhấp đúp: về độ rộng mặc định)',
          )}
        >
          <button
            type="button"
            aria-label={t('Resize the panes', 'Đổi độ rộng hai bên')}
            className="group flex shrink-0 cursor-col-resize touch-none items-center justify-center"
            style={{ width: HANDLE_PX }}
            onPointerDown={(event) => {
              dragging.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (dragging.current) {
                dragTo(event.clientX)
              }
            }}
            onPointerUp={(event) => {
              dragging.current = false
              event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onDoubleClick={() => {
              onShareChange(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                nudge(-KEY_STEP)
              } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                nudge(KEY_STEP)
              }
            }}
          >
            <span className="h-10 w-1 rounded-full bg-default opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        </Tip>
      ) : null}
      <div className={`min-h-0 min-w-0 flex-1 ${hidden === 'right' ? 'hidden' : 'flex flex-col'}`}>
        {right}
      </div>
    </div>
  )
}
