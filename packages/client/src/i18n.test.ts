import { afterEach, expect, it } from 'vitest'
import { formatClock, formatDateOnly, setLanguage, t } from './i18n.js'

afterEach(() => {
  setLanguage('en')
})

it('t returns the Vietnamese text when the language is vi', () => {
  expect(t('Settings', 'Cài đặt')).toBe('Settings')
  setLanguage('vi')
  expect(t('Settings', 'Cài đặt')).toBe('Cài đặt')
})

it('formatDateOnly shows the calendar day without a zone shift, formatClock uses the zone', () => {
  expect(formatDateOnly('2026-11-20', 'en')).toBe('Nov 20')
  expect(formatClock(new Date('2026-11-12T02:05:00Z'), 'en', 'Asia/Ho_Chi_Minh')).toMatch(
    /^9:05\sAM$/,
  )
})
