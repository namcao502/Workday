import { describe, expect, it, vi } from 'vitest'
import { passwordFor } from './password.js'

describe('passwordFor', () => {
  it('the environment wins over the prompt', async () => {
    const prompt = vi.fn(() => Promise.resolve('typed'))

    const password = await passwordFor({ WORKDAY_IMPORT_PASSWORD: 'from-env' }, true, prompt)

    expect(password).toBe('from-env')
    expect(prompt).not.toHaveBeenCalled()
  })

  it('prompts on a TTY when the environment has none', async () => {
    const password = await passwordFor({}, true, () => Promise.resolve('typed'))

    expect(password).toBe('typed')
  })

  it('is null with no TTY and no environment value', async () => {
    const prompt = vi.fn(() => Promise.resolve('typed'))

    expect(await passwordFor({ WORKDAY_IMPORT_PASSWORD: '' }, false, prompt)).toBeNull()
    expect(prompt).not.toHaveBeenCalled()
  })
})
