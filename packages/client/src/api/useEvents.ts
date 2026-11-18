import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isRecord } from '../json.js'
import { queryKeys } from './client.js'

const RECONNECT_MS = 2000
// A running Claude session sends an event per message; each refetch re-reads the whole transcript on the server.
const CHAT_REFETCH_MS = 700

// The part of WebSocket this hook uses, so a test can pass a fake.
export interface EventSocket {
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  close: () => void
}

export type SocketFactory = (url: string) => EventSocket

function openSameOriginSocket(url: string): EventSocket {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(`${scheme}//${window.location.host}${url}`)
}

// Keeps one socket to /api/events open and refetches the queries an event names.
export function useEvents(openSocket: SocketFactory = openSameOriginSocket): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    let stopped = false
    let socket: EventSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let chatTimer: ReturnType<typeof setTimeout> | undefined
    let chatQueued = false
    let wasOpen = false

    // The first event refetches at once; the ones inside the window collapse into one more refetch at its end.
    function refetchChat(): void {
      if (chatTimer !== undefined) {
        chatQueued = true
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'chat'] })
      chatTimer = setTimeout(() => {
        chatTimer = undefined
        if (chatQueued) {
          chatQueued = false
          refetchChat()
        }
      }, CHAT_REFETCH_MS)
    }

    function handleMessage(event: MessageEvent): void {
      if (typeof event.data !== 'string') {
        return
      }
      const parsed: unknown = JSON.parse(event.data)
      const type = isRecord(parsed) ? parsed['type'] : undefined
      if (type === 'board.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.board })
        void queryClient.invalidateQueries({ queryKey: queryKeys.work })
      } else if (type === 'settings.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
      } else if (type === 'remote.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.remote })
      } else if (type === 'timesheet.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.timesheet })
      } else if (type === 'notices.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notices })
      } else if (type === 'schedules.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.schedules })
      } else if (type === 'work.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.work })
      } else if (type === 'chat.changed') {
        refetchChat()
      } else if (type === 'workspace.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspace })
        void queryClient.invalidateQueries({ queryKey: queryKeys.work })
      }
    }

    function connect(): void {
      socket = openSocket('/api/events')
      // Events sent while the socket was down (sleep, lock screen, server restart) are lost: refetch everything.
      socket.onopen = () => {
        if (wasOpen) {
          void queryClient.invalidateQueries()
        }
        wasOpen = true
      }
      socket.onmessage = handleMessage
      socket.onclose = () => {
        if (!stopped) {
          reconnectTimer = setTimeout(connect, RECONNECT_MS)
        }
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(reconnectTimer)
      clearTimeout(chatTimer)
      socket?.close()
    }
  }, [queryClient, openSocket])
}
