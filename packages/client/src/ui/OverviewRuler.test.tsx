import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it } from 'vitest'
import { OverviewRuler } from './OverviewRuler.js'

afterEach(cleanup)

it('draws a mark per change and a click scrolls the pane there', () => {
  const scroller = createRef<HTMLDivElement>()
  render(
    <div>
      <div ref={scroller} />
      <OverviewRuler
        scroller={scroller}
        marks={[
          { kind: 'added', top: 0.5, height: 0.1 },
          { kind: 'removed', top: 0.1, height: 0.05 },
        ]}
      />
    </div>,
  )
  const marks = screen.getAllByRole('button', { name: /Go to the (added|removed) lines/ })
  expect(marks).toHaveLength(2)
  expect(marks[0]?.style.top).toBe('50%')
  const element = scroller.current as HTMLDivElement
  Object.defineProperty(element, 'scrollHeight', { value: 1000 })
  Object.defineProperty(element, 'clientHeight', { value: 300 })
  fireEvent.click(marks[0] as HTMLElement)
  expect(element.scrollTop).toBe(400)
})
