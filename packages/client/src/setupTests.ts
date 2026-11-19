import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom has no canvas; code that draws checks for a null context, so say so without jsdom's warning.
HTMLCanvasElement.prototype.getContext = () => null
