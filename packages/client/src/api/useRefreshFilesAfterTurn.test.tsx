import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useRefreshFilesAfterTurn } from './useWorkspace.js'

it('rereads the tab files when a Claude turn ends, not while it runs or on first show', () => {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const { rerender } = renderHook(
    ({ working }: { working: boolean }) => {
      useRefreshFilesAfterTurn('MDP-1', working)
    },
    {
      initialProps: { working: false },
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  )
  rerender({ working: true })
  expect(invalidate).not.toHaveBeenCalled()
  rerender({ working: false })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace-files', 'MDP-1'] })
})
