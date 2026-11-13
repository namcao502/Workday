import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BarChart } from './BarChart.js'
import { formatTokens } from './insightsText.js'

it('bar chart groups everything past the top ten into Other', () => {
  const bars = Array.from({ length: 13 }, (_, index) => ({
    label: `MDP-${String(index + 1)}`,
    value: 1000 * (index + 1),
  }))
  const { container } = render(<BarChart title="Tokens" bars={bars} formatValue={formatTokens} />)
  expect(container.querySelectorAll('rect.bar')).toHaveLength(11)
  // The three smallest (1k + 2k + 3k) fold into one bar with a value tooltip.
  expect(screen.getByText('Other (3)')).toBeInTheDocument()
  expect(container.querySelector('title:not(:empty)')?.textContent).toBe('MDP-13: 13k')
  expect(screen.getByText('Other (3): 6k', { selector: 'title' })).toBeInTheDocument()
})

it('tokens are shown compactly', () => {
  expect([950, 1200, 12300, 3_400_000, 1_000_000].map(formatTokens)).toEqual([
    '950',
    '1.2k',
    '12.3k',
    '3.4M',
    '1M',
  ])
})
