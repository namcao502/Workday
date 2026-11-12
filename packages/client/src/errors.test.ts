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
