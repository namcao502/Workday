import { useEffect, useState, type RefObject } from 'react'

const COLUMN_WIDTH = 260
const MAX_COLUMNS = 5

// How many 260px columns fit the element (1-5), following its width.
export function useColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1)
  useEffect(() => {
    const element = ref.current
    if (element === null || typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setColumns(Math.min(MAX_COLUMNS, Math.max(1, Math.floor(width / COLUMN_WIDTH))))
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref])
  return columns
}
