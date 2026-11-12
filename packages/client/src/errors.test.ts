import type { AppError } from '@workday/core'
import { afterEach, expect, it } from 'vitest'
import { errorText } from './errors.js'
import { setLanguage } from './i18n.js'

afterEach(() => {
  setLanguage('en')
})

it('errorText gives the Vietnamese text for notFound with its key', () => {
  setLanguage('vi')
  expect(errorText({ code: 'notFound', key: 'ABC-12' })).toBe('Không tìm thấy ABC-12')
})

const CODES: readonly AppError['code'][] = [
  'invalidKey',
  'notConnected',
  'jiraRejected',
  'jiraUnreachable',
  'pollFailed',
  'notFound',
  'alreadyOnBoard',
  'timesheetNotConfigured',
  'invalidTicket',
  'overEightHours',
  'hrmClosedForToday',
  'tscNoToken',
  'tscDateMismatch',
  'tscFailed',
  'chromeMissing',
  'browserBusy',
  'hrmRejected',
  'hrmUnreachable',
  'remoteDisabled',
  'accessRequired',
  'notPaired',
  'forbidden',
  'pairingClosed',
  'wrongCode',
]

it('errorText has English and Vietnamese text for every AppError code', () => {
  for (const code of CODES) {
    const error: AppError =
      code === 'notFound' || code === 'alreadyOnBoard' ? { code, key: 'A-1' } : { code }
    setLanguage('en')
    const english = errorText(error)
    setLanguage('vi')
    const vietnamese = errorText(error)
    expect(english).not.toBe('')
    expect(vietnamese).not.toBe('')
    expect(vietnamese).not.toBe(english)
  }
})
