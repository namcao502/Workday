import type { ChatMessage } from '@workday/core'
import { useSyncExternalStore } from 'react'

// Prompts sent to a session that the transcript does not hold yet. The chat shows them at once; Claude writes the
// transcript only after its process has started, which can take seconds.
//
// An echo is matched by row id, not by counting rows: ids are byte offsets that only grow, while the chat is a
// window of the newest rows (CHAT_PAGE_SIZE), so a new prompt can push an older one off and leave the count still.

export interface Echoes {
  readonly texts: readonly string[]
  // The newest user row when the first echo was sent; -1 for an empty chat, null until a chat view has seen one.
  readonly afterId: number | null
}

const echoes = new Map<string, Echoes>()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => {
    listener()
  })
}

function userRows(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  return messages.filter((message) => message.role === 'user')
}

// The send point for a new echo: the id of the newest user row, or -1 when there is none.
export function newestUserId(messages: readonly ChatMessage[]): number {
  return userRows(messages).at(-1)?.id ?? -1
}

// afterId: newestUserId of the chat the prompt was sent from, or null when that chat is not loaded.
export function addEcho(session: string, text: string, afterId: number | null): void {
  const current = echoes.get(session)
  echoes.set(
    session,
    current === undefined
      ? { texts: [text], afterId }
      : { texts: [...current.texts, text], afterId: current.afterId ?? afterId },
  )
  emit()
}

// A failed send: its echoes go.
export function dropEchoes(session: string): void {
  echoes.delete(session)
  emit()
}

export function readEchoes(session: string): Echoes | null {
  return echoes.get(session) ?? null
}

function arrived(state: Echoes, messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const after = state.afterId
  if (after === null) {
    return []
  }
  return userRows(messages).filter((message) => message.id > after)
}

// The echoes the transcript does not show yet: the first ones are taken over by the user rows sent since.
export function pendingEchoes(
  state: Echoes | null,
  messages: readonly ChatMessage[],
): readonly string[] {
  return state === null ? [] : state.texts.slice(arrived(state, messages).length)
}

// Drops the echoes the transcript took over and moves the send point past them; a state with no send point yet
// takes the newest row it sees.
export function consumeEchoes(session: string, messages: readonly ChatMessage[]): void {
  const state = echoes.get(session)
  if (state === undefined) {
    return
  }
  if (state.afterId === null) {
    echoes.set(session, { ...state, afterId: newestUserId(messages) })
    emit()
    return
  }
  const rows = arrived(state, messages)
  if (rows.length === 0) {
    return
  }
  const taken = Math.min(rows.length, state.texts.length)
  const rest = state.texts.slice(taken)
  if (rest.length === 0) {
    echoes.delete(session)
  } else {
    echoes.set(session, { texts: rest, afterId: rows[taken - 1]?.id ?? state.afterId })
  }
  emit()
}

export function useEchoes(session: string): Echoes | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => echoes.get(session) ?? null,
  )
}
