import { expect, it } from 'vitest'
import { holidayName } from './holidayName.js'

it('names a holiday by its own name, a built-in date, or the generic label', () => {
  expect(holidayName({ date: '2027-02-08', name: 'Tet' })).toBe('Tet')
  expect(holidayName({ date: '09-02', name: null })).toBe('National Day')
  expect(holidayName({ date: '2027-04-27', name: null })).toBe('Public holiday')
})
