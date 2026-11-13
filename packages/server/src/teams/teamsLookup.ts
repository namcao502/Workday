// What reads and writes share: the post index, cached channel and chat lists, the ticket's threads and the saved state.
import {
  findTicketChats,
  fullSizeImageUrl,
  isAmsImageUrl,
  MAX_PEOPLE,
  parseWatchList,
  people,
  postedKey,
  TeamsSignedOut,
  watched,
  type TeamsChannel,
  type TeamsGroupChat,
  type TeamsMessage,
  type TeamsOption,
  type TeamsPerson,
  type TeamsPostIndex,
  type TeamsThread,
} from '@workday/core'
import type { TeamsGateway } from './teamsChatClient.js'
import { TeamsHttpError } from './teamsHttp.js'
import { TeamsPostSync } from './teamsPosts.js'
import type { TeamsState } from './teamsStore.js'

const FULL_SIZE_VIEW = /imgpsh_fullsize_anim$/
const CACHE_LIFETIME_MS = 10 * 60 * 1000
const POSTED_KEEP_MS = 180 * 24 * 60 * 60 * 1000

export interface TeamsLookupDeps {
  readonly initialIndex: TeamsPostIndex
  readonly saveIndex: (index: TeamsPostIndex) => Promise<void>
  readonly initialState: TeamsState
  readonly saveState: (state: TeamsState) => Promise<void>
  readonly now: () => Date
  readonly log?: (message: string) => void
}

interface Cached<Value> {
  readonly value: Value
  readonly at: number
}

// A message's preview image or its full-size view; the chat token goes nowhere else.
export function isLoadableImageUrl(url: string): boolean {
  const preview = url.replace(FULL_SIZE_VIEW, 'imgo')
  return isAmsImageUrl(url) || (preview !== url && fullSizeImageUrl(preview) === url)
}

export class TeamsLookup {
  readonly posts: TeamsPostSync
  readonly now: () => Date
  private chatClient: TeamsGateway | null = null
  private watchedChannels: readonly string[] = []
  private state: TeamsState
  private stateWrites: Promise<unknown> = Promise.resolve()
  private channelCache: Cached<readonly TeamsChannel[]> | null = null
  private chatCache: Cached<readonly TeamsGroupChat[]> | null = null
  private readonly postedThisRun = new Map<string, string>()

  constructor(private readonly deps: TeamsLookupDeps) {
    this.now = deps.now
    this.state = deps.initialState
    this.posts = new TeamsPostSync({
      initial: deps.initialIndex,
      save: deps.saveIndex,
      now: deps.now,
      onFirstPage: (messages, myId) => this.collectPeople(messages, myId),
      ...(deps.log === undefined ? {} : { log: deps.log }),
    })
  }

  get chat(): TeamsGateway | null {
    return this.chatClient
  }

  get marks(): TeamsState {
    return this.state
  }

  get known(): readonly TeamsPerson[] {
    return this.state.people
  }

  // A new client or watch list starts the channel and chat lists over; returns whether it changed.
  configure(chat: TeamsGateway | null, watchedChannels: readonly string[]): boolean {
    const changed =
      chat !== this.chatClient ||
      JSON.stringify(watchedChannels) !== JSON.stringify(this.watchedChannels)
    this.chatClient = chat
    this.watchedChannels = watchedChannels
    if (changed) {
      this.channelCache = null
      this.chatCache = null
    }
    return changed
  }

  async channels(chat: TeamsGateway): Promise<readonly TeamsChannel[]> {
    const now = this.now().getTime()
    if (this.channelCache !== null && now - this.channelCache.at < CACHE_LIFETIME_MS) {
      return this.channelCache.value
    }
    const watchList = parseWatchList(this.watchedChannels)
    const found = watched(await chat.listChannels(), watchList)
    if (found.length < watchList.length) {
      this.log('[teams] a watched channel was not found')
    }
    this.channelCache = { value: found, at: now }
    return found
  }

  // The ticket's chats; a failed refresh keeps the old list and its time, a list never read gives none.
  async ticketChats(chat: TeamsGateway, ticketKey: string): Promise<readonly TeamsGroupChat[]> {
    const now = this.now().getTime()
    if (this.chatCache === null || now - this.chatCache.at >= CACHE_LIFETIME_MS) {
      try {
        this.chatCache = { value: await chat.listChats(), at: now }
      } catch (error: unknown) {
        if (error instanceof TeamsSignedOut) {
          throw error
        }
        this.log(`[teams] ${ticketKey}: the chat list failed`)
      }
    }
    return this.chatCache === null ? [] : findTicketChats(this.chatCache.value, ticketKey)
  }

  // Null when the root is gone: a deleted root still answers with its replies, only its absence tells.
  async postThread(
    chat: TeamsGateway,
    channelId: string,
    rootId: string,
  ): Promise<TeamsThread | null> {
    try {
      const thread = await chat.thread(channelId, rootId)
      return thread.messages.some((message) => message.id === rootId) ? thread : null
    } catch (error: unknown) {
      if (error instanceof TeamsHttpError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  // The ticket's own conversation behind an id: its indexed post in a watched channel, or one of its chats.
  async resolveThread(
    chat: TeamsGateway,
    ticketKey: string,
    conversationId: string,
  ): Promise<TeamsThread | null> {
    const channels = await this.channels(chat)
    if (channels.some((tc) => tc.id === conversationId)) {
      const post = this.posts.get(conversationId).posts[ticketKey.toUpperCase()]
      return post === undefined ? null : this.postThread(chat, conversationId, post.rootId)
    }
    const chats = await this.ticketChats(chat, ticketKey)
    return chats.some((tgc) => tgc.id === conversationId) ? chat.chat(conversationId) : null
  }

  // Every watched channel, "posted" where the index holds the ticket's post; then the ticket's chats.
  options(
    channels: readonly TeamsChannel[],
    readable: readonly string[],
    chats: readonly TeamsGroupChat[],
    key: string,
  ): readonly TeamsOption[] {
    const channelOptions = channels.map((tc) => ({
      id: tc.id,
      label: `${tc.teamName} > ${tc.channelName}`,
      kind: 'channel' as const,
      posted: readable.includes(tc.id) && this.posts.get(tc.id).posts[key] !== undefined,
    }))
    const chatOptions = chats.map((tgc) => ({
      id: tgc.id,
      label: tgc.topic,
      kind: 'chat' as const,
      posted: true,
    }))
    return [...channelOptions, ...chatOptions]
  }

  // Moves the senders seen to the front of the saved people; written only when the list changed.
  collectPeople(messages: readonly TeamsMessage[], myId: string): Promise<void> {
    const thread: TeamsThread = { conversationId: '', rootId: '', messages, isChat: false }
    return this.changeState((state) => {
      const merged = people([thread], state.people, myId).slice(0, MAX_PEOPLE)
      return JSON.stringify(merged) === JSON.stringify(state.people)
        ? state
        : { ...state, people: merged }
    })
  }

  postedAt(ticketKey: string): string | null {
    const key = postedKey(ticketKey)
    const at = this.postedThisRun.get(key) ?? this.state.postedAt[key]
    const isKept = at !== undefined && this.now().getTime() - Date.parse(at) < POSTED_KEEP_MS
    return isKept ? at : null
  }

  // In memory first, so a failed save still blocks a second post; marks older than 180 days are dropped.
  recordPost(ticketKey: string): Promise<void> {
    const now = this.now()
    this.postedThisRun.set(postedKey(ticketKey), now.toISOString())
    return this.changeState((state) => {
      const kept = Object.entries(state.postedAt).filter(
        ([, at]) => now.getTime() - Date.parse(at) < POSTED_KEEP_MS,
      )
      const postedAt = { ...Object.fromEntries(kept), [postedKey(ticketKey)]: now.toISOString() }
      return { ...state, postedAt }
    })
  }

  log(message: string): void {
    ;(this.deps.log ?? console.info)(message)
  }

  // Saved before memory changes, one write at a time; the same state object means no write.
  changeState(change: (state: TeamsState) => TeamsState): Promise<void> {
    const run = this.stateWrites.then(async () => {
      const next = change(this.state)
      if (next !== this.state) {
        await this.deps.saveState(next)
        this.state = next
      }
    })
    this.stateWrites = run.catch(() => undefined)
    return run
  }
}
