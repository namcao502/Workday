// Port of TeamsThreadService's writes: one queue per ticket, and a write that may have reached Teams is never blindly repeated.
import {
  buildBody,
  canReact,
  isEditable,
  TeamsBusy,
  TeamsSignedOut,
  TeamsUncertain,
  withoutPost,
  type AppError,
  type TeamsDraft,
  type TeamsMessageBody,
  type TeamsThread,
  type TeamsWriteResult,
} from '@workday/core'
import type { TeamsGateway } from './teamsChatClient.js'
import type { TeamsLookup } from './teamsLookup.js'

// 'invalid': the request itself is wrong (empty after the whitelist, a key Teams does not take); the route answers 400.
export type WriteOutcome = TeamsWriteResult | 'invalid'

export interface PostRequest {
  readonly channelId: string
  readonly subject: string
  readonly draft: TeamsDraft
  readonly confirm: boolean
}

export interface ReplyRequest {
  readonly conversationId: string
  readonly rootId: string | null
  readonly draft: TeamsDraft
  readonly confirm: boolean
}

export interface MessageRequest {
  readonly conversationId: string
  readonly messageId: string
}

export interface EditRequest extends MessageRequest {
  readonly subject: string | null
  readonly draft: TeamsDraft
}

const FAILED: WriteOutcome = { ok: false, error: { code: 'teamsFailed' } }
const NOT_MINE: WriteOutcome = { ok: false, error: { code: 'forbidden' } }
const UNCERTAIN: WriteOutcome = { ok: false, error: { code: 'teamsUncertain' } }

export function teamsError(error: unknown): AppError {
  if (error instanceof TeamsSignedOut) {
    return { code: 'teamsSignedOut' }
  }
  if (error instanceof TeamsBusy) {
    return { code: 'teamsBusy' }
  }
  return { code: error instanceof TeamsUncertain ? 'teamsUncertain' : 'teamsFailed' }
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

// A reply to a post goes to the post's own conversation; the root itself and a chat message to the conversation.
function conversationOf(thread: TeamsThread, messageId: string): string {
  const isRoot = !thread.isChat && messageId === thread.rootId
  return isRoot || thread.isChat
    ? thread.conversationId
    : `${thread.conversationId};messageid=${thread.rootId}`
}

export class TeamsWrites {
  private readonly queues = new Map<string, Promise<unknown>>()
  // place -> the content of a send that may have reached Teams; the same content again needs confirm.
  private readonly uncertain = new Map<string, string>()

  constructor(private readonly lookup: TeamsLookup) {}

  post(ticketKey: string, request: PostRequest): Promise<WriteOutcome> {
    return this.run(ticketKey, 'post', async (chat) => {
      const body = buildBody(request.draft)
      const subject = request.subject.trim()
      if (body === null || subject === '') {
        return 'invalid'
      }
      const channels = await this.lookup.channels(chat)
      if (!channels.some((tc) => tc.id === request.channelId)) {
        return 'invalid'
      }
      const place = `${ticketKey}|post`
      const content = `${subject}\n${body.html}`
      const warned =
        this.lookup.postedAt(ticketKey) !== null || this.uncertain.get(place) === content
      if (warned && !request.confirm) {
        return UNCERTAIN
      }
      const id = await this.send(place, content, () =>
        chat.postMessage(request.channelId, subject, body),
      )
      await this.recordPost(ticketKey, request.channelId, id)
      return { ok: true, id }
    })
  }

  reply(ticketKey: string, request: ReplyRequest): Promise<WriteOutcome> {
    return this.run(ticketKey, 'reply', async (chat) => {
      const body = buildBody(request.draft)
      if (body === null) {
        return 'invalid'
      }
      const thread = await this.lookup.resolveThread(chat, ticketKey, request.conversationId)
      const rootMatches =
        thread?.isChat === true || request.rootId === null || request.rootId === thread?.rootId
      if (thread === null || !rootMatches) {
        return FAILED
      }
      const place = `${ticketKey}|${request.conversationId}|reply`
      if (this.uncertain.get(place) === body.html && !request.confirm) {
        return UNCERTAIN
      }
      const id = await this.send(place, body.html, () => this.sendReply(chat, thread, body))
      return { ok: true, id }
    })
  }

  edit(ticketKey: string, request: EditRequest): Promise<WriteOutcome> {
    return this.run(ticketKey, 'edit', async (chat) => {
      const thread = await this.lookup.resolveThread(chat, ticketKey, request.conversationId)
      const message = thread?.messages.find((tm) => tm.id === request.messageId)
      if (thread === null || message === undefined) {
        return FAILED
      }
      if (!sameId(message.senderId, await chat.myId()) || !isEditable(message)) {
        return NOT_MINE
      }
      const isRoot = !thread.isChat && message.id === thread.rootId
      const subject = isRoot ? (request.subject?.trim() ?? '') : null
      const body = buildBody(request.draft)
      const keepsKey = subject === null || subject.toUpperCase().startsWith(ticketKey.toUpperCase())
      if (body === null || !keepsKey) {
        return 'invalid'
      }
      await chat.editMessage(conversationOf(thread, message.id), message.id, subject, body)
      return { ok: true, id: message.id }
    })
  }

  remove(ticketKey: string, request: MessageRequest): Promise<WriteOutcome> {
    return this.run(ticketKey, 'delete', async (chat) => {
      const thread = await this.lookup.resolveThread(chat, ticketKey, request.conversationId)
      const message = thread?.messages.find((tm) => tm.id === request.messageId)
      if (thread === null || message === undefined) {
        return FAILED
      }
      if (!sameId(message.senderId, await chat.myId())) {
        return NOT_MINE
      }
      await chat.deleteMessage(conversationOf(thread, message.id), message.id)
      if (!thread.isChat && message.id === thread.rootId) {
        const key = ticketKey.toUpperCase()
        await this.lookup.posts.update(thread.conversationId, (index) =>
          index.posts[key]?.rootId === message.id ? withoutPost(index, key) : index,
        )
      }
      return { ok: true, id: null }
    })
  }

  // Adds the reaction, or takes it off when it is already mine.
  react(
    ticketKey: string,
    request: MessageRequest & { readonly key: string },
  ): Promise<WriteOutcome> {
    return this.run(ticketKey, 'reaction', async (chat) => {
      const thread = await this.lookup.resolveThread(chat, ticketKey, request.conversationId)
      const message = thread?.messages.find((tm) => tm.id === request.messageId)
      if (thread === null || message === undefined) {
        return FAILED
      }
      if (!canReact(message, request.key)) {
        return 'invalid'
      }
      const myId = await chat.myId()
      const mine = message.reactions.some(
        (reaction) =>
          reaction.key === request.key && reaction.userMris.some((mri) => sameId(mri, myId)),
      )
      await chat.setReaction(conversationOf(thread, message.id), message.id, request.key, !mine)
      return { ok: true, id: null }
    })
  }

  // The post is out: a failed save is logged, never reported as a failed post.
  private async recordPost(ticketKey: string, channelId: string, rootId: string): Promise<void> {
    try {
      await this.lookup.recordPost(ticketKey)
      const post = { rootId, sentAt: this.lookup.now().toISOString(), mine: true }
      await this.lookup.posts.update(channelId, (index) => ({
        ...index,
        posts: { ...index.posts, [ticketKey.toUpperCase()]: post },
      }))
    } catch {
      this.lookup.log(`[teams] ${ticketKey}: saving the posted mark failed`)
    }
  }

  private sendReply(
    chat: TeamsGateway,
    thread: TeamsThread,
    body: TeamsMessageBody,
  ): Promise<string> {
    return thread.isChat
      ? chat.postChatMessage(thread.conversationId, body)
      : chat.postReply(thread.conversationId, thread.rootId, body)
  }

  // Remembers the content of an uncertain send; a clean send forgets it.
  private async send(
    place: string,
    content: string,
    write: () => Promise<string>,
  ): Promise<string> {
    try {
      const id = await write()
      this.uncertain.delete(place)
      return id
    } catch (error: unknown) {
      if (error instanceof TeamsUncertain) {
        this.uncertain.set(place, content)
      }
      throw error
    }
  }

  // Writes of one ticket run one at a time; logs name the action only, never the content.
  private run(
    ticketKey: string,
    action: string,
    work: (chat: TeamsGateway) => Promise<WriteOutcome>,
  ): Promise<WriteOutcome> {
    const chat = this.lookup.chat
    if (chat === null) {
      return Promise.resolve({ ok: false, error: { code: 'teamsNotConfigured' } })
    }
    const previous = this.queues.get(ticketKey) ?? Promise.resolve()
    const result = previous.then(async (): Promise<WriteOutcome> => {
      try {
        const outcome = await work(chat)
        this.lookup.log(
          `[teams] ${ticketKey}: ${action} ${outcome === 'invalid' || !outcome.ok ? 'refused' : 'sent'}`,
        )
        return outcome
      } catch (error: unknown) {
        this.lookup.log(`[teams] ${ticketKey}: ${action} failed`)
        return { ok: false, error: teamsError(error) }
      }
    })
    // The entry goes once its tail settles, so the map holds only tickets with writes in flight.
    const tail: Promise<unknown> = result.then(() => {
      if (this.queues.get(ticketKey) === tail) {
        this.queues.delete(ticketKey)
      }
    })
    this.queues.set(ticketKey, tail)
    return result
  }
}
