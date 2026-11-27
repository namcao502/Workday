import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DayChart } from './DayChart.js'
import { formatTokens } from './insightsText.js'

it('shows hours and tokens of each day side by side, values under a short range', () => {
  render(
    <DayChart
      days={[
        { day: '2026-11-25', hours: 8, tokens: 10_100_000 },
        { day: '2026-11-26', hours: 0, tokens: 142_500_000 },
      ]}
    />,
  )
  expect(screen.getByRole('img', { name: 'Nov 25: 8h, 10.1M' })).toBeInTheDocument()
  expect(screen.getByText('0h · 142.5M')).toBeInTheDocument()
  expect(screen.getByText('hours')).toBeInTheDocument()
})

it('without HRM hours only tokens are drawn, and a long range keeps just the day numbers', () => {
  const days = Array.from({ length: 12 }, (_, index) => ({
    day: `2026-11-${String(index + 1).padStart(2, '0')}`,
    hours: null,
    tokens: 1000 * (index + 1),
  }))
  render(<DayChart days={days} />)
  expect(screen.queryByText('hours')).toBeNull()
  expect(screen.getByRole('img', { name: 'Nov 1: 1k' })).toBeInTheDocument()
  expect(screen.getByText('12')).toBeInTheDocument()
  expect(screen.queryByText('12k')).toBeNull()
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
