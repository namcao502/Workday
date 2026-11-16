import { render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { setLanguage } from '../i18n.js'
import { GuideSection } from './GuideSection.js'

afterEach(() => {
  setLanguage('en')
})

it('GuideSection shows the Vietnamese guide when the language is vi', () => {
  setLanguage('vi')
  render(<GuideSection />)
  expect(screen.getByRole('heading', { name: 'Đi lại trong app' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Hướng dẫn' })).toBeInTheDocument()
})

it('GuideSection shows the English guide by default', () => {
  render(<GuideSection />)
  expect(screen.getByRole('heading', { name: 'Getting around' })).toBeInTheDocument()
})
