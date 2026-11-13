// Port of TeamsThreadService (+ .Chats): finds the ticket's post or chat and reads it; writes are in teamsWrites.ts.
import {
  latestPrs,
  people,
  TeamsSignedOut,
  withoutPost,
  type AppError,
  type BoardState,
  type PrTracking,
  type TeamsChannel,
  type TeamsConfig,
  type TeamsConversationView,
  type TeamsGroupChat,
  type TeamsImage,
  type TeamsOption,
  type TeamsStatusView,
  type TeamsThread,
} from '@workday/core'
import type { TeamsGateway } from './teamsChatClient.js'
import { loadPostDraft, ticketSummary } from './teamsDraft.js'
import { buildClaudeTask, handOff, type PromptOutcome } from './teamsHandOff.js'
import { isLoadableImageUrl, TeamsLookup, type TeamsLookupDeps } from './teamsLookup.js'
import { TeamsWrites, teamsError } from './teamsWrites.js'

const TEAMS_LINK = 'https://teams.microsoft.com/l/message'
const CHAT_CONTEXT = '?context=%7B%22contextType%22%3A%22chat%22%7D'

export interface TeamsSettings {
  readonly chat: TeamsGateway | null
  readonly config: TeamsConfig
  readonly devRepoPath: string | null
  readonly repoLabels: Readonly<Record<string, string>>
  readonly timeZone: string
}

export interface TeamsServiceDeps extends TeamsLookupDeps {
  readonly board: { snapshot(): BoardState }
  readonly prs: { state(): { readonly tracking: PrTracking } }
  readonly workspace: {
    promptState(name: string): PromptOutcome
    prompt(name: string, text: string): PromptOutcome
  }
  readonly tmpDir: string
}

export interface HandOffRequest {
  readonly conversationId: string
  readonly messageId: string
  readonly session: string
}

type Outcome = { readonly ok: true } | { readonly ok: false; readonly error: AppError }

const NOT_CONFIGURED: TeamsSettings = {
  chat: null,
  config: { watchedChannels: [], postLeadName: null, postGreeting: null },
  devRepoPath: null,
  repoLabels: {},
  timeZone: 'UTC',
}

export class TeamsService {
  readonly lookup: TeamsLookup
  readonly write: TeamsWrites
  private settings: TeamsSettings = NOT_CONFIGURED
  private signedIn: boolean | null = null
  private readonly signInListeners: (() => void)[] = []

  constructor(private readonly deps: TeamsServiceDeps) {
    this.lookup = new TeamsLookup(deps)
    this.write = new TeamsWrites(this.lookup)
  }

  // True when the client or the watch list changed.
  configure(settings: TeamsSettings): boolean {
    this.settings = settings
    const changed = this.lookup.configure(settings.chat, settings.config.watchedChannels)
    if (changed) {
      this.signedIn = null
    }
    return changed
  }

  // Called after each successful sign-in, so the reminder watch can resume.
  onSignedIn(listener: () => void): void {
    this.signInListeners.push(listener)
  }

  status(): TeamsStatusView {
    const configured = this.settings.chat !== null
    return { configured, signedIn: configured ? this.signedIn : null }
  }

  async signIn(): Promise<Outcome> {
    const { chat } = this.settings
    if (chat === null) {
      return { ok: false, error: { code: 'teamsNotConfigured' } }
    }
    try {
      await chat.signIn()
      this.signedIn = true
    } catch (error: unknown) {
      return { ok: false, error: teamsError(error) }
    }
    this.signInListeners.forEach((listener) => {
      listener()
    })
    return { ok: true }
  }

  // Null for anything but a message image, so the chat token never goes to another host.
  async image(url: string): Promise<TeamsImage | null> {
    const { chat } = this.settings
    return chat === null || !isLoadableImageUrl(url) ? null : chat.image(url)
  }

  async read(ticketKey: string, conversationId: string): Promise<TeamsConversationView> {
    const { chat } = this.settings
    if (chat === null) {
      return { state: 'notConfigured' }
    }
    try {
      const view = await this.readWith(chat, ticketKey, conversationId)
      this.signedIn = true
      return view
    } catch (error: unknown) {
      if (error instanceof TeamsSignedOut) {
        this.signedIn = false
        return { state: 'signedOut' }
      }
      throw error
    }
  }

  async handOff(ticketKey: string, request: HandOffRequest): Promise<Outcome> {
    const { chat, timeZone } = this.settings
    if (chat === null) {
      return { ok: false, error: { code: 'teamsNotConfigured' } }
    }
    try {
      const thread = await this.lookup.resolveThread(chat, ticketKey, request.conversationId)
      if (thread?.messages.some((message) => message.id === request.messageId) !== true) {
        return { ok: false, error: { code: 'teamsFailed' } }
      }
      const summary = ticketSummary(this.deps.board.snapshot(), ticketKey)
      const myId = await chat.myId()
      const text = buildClaudeTask(ticketKey, summary, thread, request.messageId, myId, timeZone)
      return await handOff(
        {
          tmpDir: this.deps.tmpDir,
          now: this.deps.now,
          timeZone,
          prompt: (session, line) => this.deps.workspace.prompt(session, line),
          isPromptable: (session) => this.deps.workspace.promptState(session),
        },
        { ticketKey, text, session: request.session },
      )
    } catch (error: unknown) {
      return { ok: false, error: teamsError(error) }
    }
  }

  private async readWith(
    chat: TeamsGateway,
    ticketKey: string,
    conversationId: string,
  ): Promise<TeamsConversationView> {
    const myId = await chat.myId()
    const channels = await this.lookup.channels(chat)
    const chats = await this.lookup.ticketChats(chat, ticketKey)
    const isChannel = conversationId === '' || channels.some((tc) => tc.id === conversationId)
    if (!isChannel && chats.some((tgc) => tgc.id === conversationId)) {
      return this.readChat(chat, ticketKey, conversationId, channels, chats, myId)
    }
    // A chosen post or chat that is gone goes back to the default post.
    const onlyChannel = conversationId === '' || !isChannel ? null : conversationId
    // A picked channel is synced first, so its scan gets the page budget (C# SelectChannel).
    const ids = channels.map((tc) => tc.id)
    const lookup =
      onlyChannel === null ? ids : [onlyChannel, ...ids.filter((id) => id !== onlyChannel)]
    const unreadable = await this.lookup.posts.syncChannels(chat, lookup, myId)
    const readable = lookup.filter((id) => !unreadable.includes(id))
    // A picked channel waits only for its own scan.
    const searching = readable.some(
      (id) =>
        (onlyChannel === null || id === onlyChannel) && !this.lookup.posts.get(id).deepScanned,
    )
    const key = ticketKey.toUpperCase()
    const candidates = readable
      .flatMap((channelId) => {
        const post = this.lookup.posts.get(channelId).posts[key]
        return post === undefined ? [] : [{ channelId, post }]
      })
      .filter((found) => onlyChannel === null || found.channelId === onlyChannel)
      .sort(
        (a, b) =>
          Number(b.post.mine) - Number(a.post.mine) ||
          Number(b.channelId === lookup[0]) - Number(a.channelId === lookup[0]) ||
          Date.parse(b.post.sentAt) - Date.parse(a.post.sentAt),
      )
    for (const { channelId, post } of candidates) {
      const thread = await this.lookup.postThread(chat, channelId, post.rootId)
      if (thread !== null) {
        await this.lookup.collectPeople(thread.messages, myId)
        const options = this.lookup.options(channels, readable, chats, key)
        return this.threadView(options, channelId, thread, myId)
      }
      this.lookup.log(`[teams] ${ticketKey}: the indexed post is gone, dropped it`)
      // A sync may have indexed a newer post meanwhile; only the gone one is dropped.
      await this.lookup.posts.update(channelId, (index) =>
        index.posts[key]?.rootId === post.rootId ? withoutPost(index, key) : index,
      )
    }
    const options = this.lookup.options(channels, readable, chats, key)
    if (searching) {
      return { state: 'searching', options }
    }
    const firstChat = chats[0]
    if (onlyChannel === null && firstChat !== undefined) {
      return this.readChat(chat, ticketKey, firstChat.id, channels, chats, myId)
    }
    return this.notPosted(ticketKey, options, onlyChannel ?? lookup[0] ?? '')
  }

  private async readChat(
    chat: TeamsGateway,
    ticketKey: string,
    chatId: string,
    channels: readonly TeamsChannel[],
    chats: readonly TeamsGroupChat[],
    myId: string,
  ): Promise<TeamsConversationView> {
    // The search a post read runs, so the options list a post made while a chat shows.
    let readable = channels.map((tc) => tc.id)
    try {
      const unreadable = await this.lookup.posts.syncChannels(
        chat,
        channels.map((tc) => tc.id),
        myId,
      )
      readable = readable.filter((id) => !unreadable.includes(id))
    } catch (error: unknown) {
      if (error instanceof TeamsSignedOut) {
        throw error
      }
      this.lookup.log(`[teams] ${ticketKey}: the channels could not be searched with the chat read`)
    }
    const thread = await chat.chat(chatId)
    await this.lookup.collectPeople(thread.messages, myId)
    const options = this.lookup.options(channels, readable, chats, ticketKey.toUpperCase())
    return this.threadView(options, chatId, thread, myId)
  }

  private async notPosted(
    ticketKey: string,
    options: readonly TeamsOption[],
    channelId: string,
  ): Promise<TeamsConversationView> {
    const { config, devRepoPath, repoLabels } = this.settings
    const draft = await loadPostDraft(ticketKey, {
      devRepoPath,
      summary: ticketSummary(this.deps.board.snapshot(), ticketKey),
      prs: latestPrs(ticketKey, this.deps.prs.state().tracking, repoLabels),
      repoLabels,
      config,
      people: this.lookup.known,
    })
    const posted = this.lookup.postedAt(ticketKey) !== null
    return { state: 'notPosted', options, channelId, draft, posted }
  }

  private threadView(
    options: readonly TeamsOption[],
    conversationId: string,
    thread: TeamsThread,
    myId: string,
  ): TeamsConversationView {
    const lastId = thread.messages.at(-1)?.id ?? '0'
    const deepLink = thread.isChat
      ? `${TEAMS_LINK}/${encodeURIComponent(conversationId)}/${encodeURIComponent(lastId)}${CHAT_CONTEXT}`
      : `${TEAMS_LINK}/${encodeURIComponent(conversationId)}/${encodeURIComponent(thread.rootId)}?parentMessageId=${encodeURIComponent(thread.rootId)}`
    return {
      state: 'thread',
      options,
      conversationId,
      thread,
      myId,
      people: people([thread], this.lookup.known, myId),
      deepLink,
    }
  }
}
