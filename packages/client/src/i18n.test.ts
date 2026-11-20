import { afterEach, expect, it } from 'vitest'
import { formatClock, formatDateOnly, setLanguage, t } from './i18n.js'

afterEach(() => {
  setLanguage('en')
})

it('t reads the key from the current language file and fills its placeholders', () => {
  expect(t('shell.settings')).toBe('Settings')
  expect(t('api.opening', { id: 'MDP-1' })).toBe('Opening MDP-1')
  setLanguage('vi')
  expect(t('shell.settings')).toBe('Cài đặt')
  expect(t('api.opening', { id: 'MDP-1' })).toBe('Đang mở MDP-1')
})

it('vi has a text for every key of en', async () => {
  const { en } = await import('./i18n/en.js')
  const { vi } = await import('./i18n/vi.js')
  const keysOf = (catalog: Readonly<Record<string, Readonly<Record<string, string>>>>): string[] =>
    Object.entries(catalog).flatMap(([area, texts]) =>
      Object.keys(texts).map((key) => `${area}.${key}`),
    )
  expect(keysOf(vi)).toEqual(keysOf(en))
  expect(
    Object.values(vi)
      .flatMap((texts) => Object.values(texts))
      .every((text) => text !== ''),
  ).toBe(true)
})

it('formatDateOnly shows the calendar day without a zone shift, formatClock uses the zone', () => {
  expect(formatDateOnly('2026-11-20', 'en')).toBe('Nov 20')
  expect(formatClock(new Date('2026-11-12T02:05:00Z'), 'en', 'Asia/Ho_Chi_Minh')).toMatch(
    /^9:05\sAM$/,
  )
})
