import { ChevronLeft, ChevronRight, Xmark } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n.js'

export interface ViewerImage {
  readonly src: string // what is shown at once (the preview)
  readonly fullSrc: string | null // a sharper copy, swapped in when it has loaded
}

interface ImageViewerProps {
  readonly images: readonly ViewerImage[]
  readonly startIndex: number
  readonly onClose: () => void
}

const FIT_MARGIN_X = 32
const FIT_MARGIN_Y = 16
const MAX_SCALE = 8
const WHEEL_STEP = 0.002
const KEY_STEP = 1.25
const DRAG_PX = 4

interface Anchor {
  readonly pointX: number // where in the image the zoom centered, as fractions of its size
  readonly pointY: number
  readonly clientX: number
  readonly clientY: number
}

// Port of the WPF app's image viewer (shared/image-viewer.js): the image over the whole page, wheel zoom around the
// cursor, a click zooms in or back to fit, a drag moves a zoomed image, Left / Right / + / - / 0 / Esc on the keyboard.
export function ImageViewer({ images, startIndex, onClose }: ImageViewerProps): React.JSX.Element {
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, images.length - 1)))
  const [shown, setShown] = useState<string | null>(null) // a loaded full-size copy replaces the preview
  const [scale, setScale] = useState(0) // 0 = fit the stage, else the image's own pixels times this
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const anchor = useRef<Anchor | null>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const dragged = useRef(false)
  const image = images[index]

  const fit =
    natural.width === 0
      ? 1
      : Math.min(
          1,
          (stageSize.width - FIT_MARGIN_X) / natural.width,
          (stageSize.height - FIT_MARGIN_Y) / natural.height,
        )
  const current = scale === 0 ? fit : scale

  // A new image starts at fit; its full-size copy loads in the background and replaces the preview.
  useEffect(() => {
    setScale(0)
    setShown(null)
    setNatural({ width: 0, height: 0 })
    const stage = stageRef.current
    // jsdom has no scrollTo, so the call is guarded.
    if (stage !== null && typeof stage.scrollTo === 'function') {
      stage.scrollTo(0, 0)
    }
    const full = image?.fullSrc ?? null
    if (full === null) {
      return undefined
    }
    let cancelled = false
    const loader = new Image()
    loader.onload = () => {
      if (!cancelled) {
        setShown(full)
      }
    }
    loader.src = full
    return () => {
      cancelled = true
    }
  }, [image])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (stage === null) {
      return undefined
    }
    const measure = (): void => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [])

  // After a zoom the image point that was under the cursor goes back under it.
  useLayoutEffect(() => {
    const stage = stageRef.current
    const element = imageRef.current
    const pending = anchor.current
    if (stage === null || element === null || pending === null) {
      return
    }
    anchor.current = null
    const after = element.getBoundingClientRect()
    stage.scrollLeft += after.left + pending.pointX * after.width - pending.clientX
    stage.scrollTop += after.top + pending.pointY * after.height - pending.clientY
  }, [scale])

  const zoomTo = useCallback(
    (next: number, clientX?: number, clientY?: number): void => {
      const stage = stageRef.current
      const element = imageRef.current
      if (stage === null || element === null || natural.width === 0) {
        return
      }
      const before = element.getBoundingClientRect()
      const box = stage.getBoundingClientRect()
      const x = clientX ?? box.left + box.width / 2
      const y = clientY ?? box.top + box.height / 2
      anchor.current = {
        pointX: (x - before.left) / before.width,
        pointY: (y - before.top) / before.height,
        clientX: x,
        clientY: y,
      }
      const clamped = Math.min(MAX_SCALE, Math.max(fit, next))
      setScale(clamped - fit < 0.001 ? 0 : clamped)
    },
    [fit, natural.width],
  )

  const step = useCallback(
    (delta: number): void => {
      if (images.length > 1) {
        setIndex((value) => (value + delta + images.length) % images.length)
      }
    },
    [images.length],
  )

  // Keys go to the viewer, not to the page behind it.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const handled = ['Escape', 'ArrowLeft', 'ArrowRight', '+', '=', '-', '0'].includes(event.key)
      if (!handled) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft') {
        step(-1)
      } else if (event.key === 'ArrowRight') {
        step(1)
      } else if (event.key === '0') {
        zoomTo(0)
      } else {
        zoomTo(event.key === '-' ? current / KEY_STEP : current * KEY_STEP)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose, step, zoomTo, current])

  // Passive: false, so the page behind neither scrolls nor zooms.
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) {
      return undefined
    }
    function onWheel(event: WheelEvent): void {
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY
      zoomTo(current * Math.exp(-delta * WHEEL_STEP), event.clientX, event.clientY)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      stage.removeEventListener('wheel', onWheel)
    }
  }, [zoomTo, current])

  if (image === undefined) {
    return <></>
  }
  const zoomed = scale !== 0
  const percent = natural.width === 0 ? '' : `${String(Math.round(current * 100))}%`
  const sizeStyle =
    natural.width === 0
      ? { maxWidth: '100%', maxHeight: '100%' }
      : { width: Math.round(natural.width * current), height: Math.round(natural.height * current) }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.imageViewer')}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-sm">
          {images.length > 1 ? `${String(index + 1)} / ${String(images.length)}` : ''}
        </span>
        <span className="text-sm opacity-70">{percent}</span>
        <span className="flex-1" />
        {images.length > 1 ? (
          <>
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              aria-label={t('ui.previous')}
              onPress={() => {
                step(-1)
              }}
            >
              <ChevronLeft />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              aria-label={t('ui.next')}
              onPress={() => {
                step(1)
              }}
            >
              <ChevronRight />
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            zoomTo(zoomed ? 0 : 1)
          }}
        >
          {zoomed ? t('ui.fit') : t('ui.actualSize')}
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="secondary"
          autoFocus
          aria-label={t('ui.close')}
          onPress={onClose}
        >
          <Xmark />
        </Button>
      </div>
      <div
        ref={stageRef}
        className={`flex min-h-0 flex-1 overflow-auto ${zoomed ? 'cursor-grab' : ''}`}
        onClick={(event) => {
          // The dark area around the image closes the viewer, unless the click ended a drag.
          if (event.target === event.currentTarget && !dragged.current) {
            onClose()
          }
        }}
        onPointerDown={(event) => {
          dragged.current = false
          const stage = event.currentTarget
          if (zoomed && event.button === 0 && event.target === imageRef.current) {
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: stage.scrollLeft,
              top: stage.scrollTop,
            }
            stage.setPointerCapture(event.pointerId)
          }
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (start === null) {
            return
          }
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) + Math.abs(dy) > DRAG_PX) {
            dragged.current = true
          }
          event.currentTarget.scrollLeft = start.left - dx
          event.currentTarget.scrollTop = start.top - dy
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <img
          ref={imageRef}
          src={shown ?? image.src}
          alt=""
          draggable={false}
          className="m-auto block max-w-none select-none"
          style={sizeStyle}
          onLoad={(event) => {
            const loaded = event.currentTarget
            // A sharper copy keeps the size on screen: only the detail changes.
            setScale((value) =>
              value !== 0 && natural.width !== 0
                ? (value * natural.width) / loaded.naturalWidth
                : value,
            )
            setNatural({ width: loaded.naturalWidth, height: loaded.naturalHeight })
          }}
          onClick={(event) => {
            if (dragged.current) {
              return
            }
            zoomTo(zoomed ? 0 : fit < 1 ? 1 : 2, event.clientX, event.clientY)
          }}
        />
      </div>
    </div>,
    document.body,
  )
}
