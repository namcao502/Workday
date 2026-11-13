import {
  TeamsSignedOut,
  type TeamsChannel,
  type TeamsGroupChat,
  type TeamsImage,
  type TeamsMessage,
  type TeamsMessageBody,
  type TeamsMessagePage,
  type TeamsThread,
} from '@workday/core'
import type { TeamsGateway } from '../teams/teamsChatClient.js'
import { TeamsHttpError } from '../teams/teamsHttp.js'

export const ME = '8:orgid:00000000-0000-0000-0000-000000000001'
export const NOON = new Date('2026-11-10T05:00:00.000Z')
export const AMS_URL = 'https://eu-api.asm.skype.com/v1/objects/0-weu-d1-abc/views/imgo'

export function teamsMessage(
  id: string,
  options: Partial<TeamsMessage> & { readonly minutes?: number } = {},
): TeamsMessage {
  const { minutes = 0, ...rest } = options
  return {
    id,
    senderId: ME,
    senderName: 'Me',
    sentAt: new Date(NOON.getTime() + minutes * 60_000).toISOString(),
    content: 'body',
    isPlainText: true,
    subject: null,
    editedAt: null,
    mentionMris: {},
    hasFiles: false,
    reactions: [],
    rootMessageId: null,
    files: [],
    ...rest,
  }
}

export function pageOf(backwardLink: string | null, ...messages: TeamsMessage[]): TeamsMessagePage {
  return { messages, backwardLink }
}

export function threadOf(
  channelId: string,
  rootId: string,
  ...replies: TeamsMessage[]
): TeamsThread {
  const root = teamsMessage(rootId, { subject: 'MDP-1 subject' })
  return { conversationId: channelId, rootId, messages: [root, ...replies], isChat: false }
}

interface Sent {
  readonly conversationId: string
  readonly subject: string | null
  readonly body: TeamsMessageBody
}

// A scripted Teams: pages, threads and chats are set by the test; writes are recorded.
export class FakeTeams implements TeamsGateway {
  readonly channels: TeamsChannel[] = []
  readonly pages = new Map<string, TeamsMessagePage>()
  readonly threads = new Map<string, TeamsThread>()
  readonly chats: TeamsGroupChat[] = []
  readonly chatThreads = new Map<string, TeamsThread>()
  readonly pageCalls: (readonly [string, string | null])[] = []
  readonly forbidden = new Set<string>()
  readonly sent: Sent[] = []
  readonly edits: (readonly [string, string, string | null])[] = []
  readonly deletes: (readonly [string, string])[] = []
  readonly reactions: (readonly [string, string, string, boolean])[] = []
  readonly imageCalls: string[] = []
  writeError: Error | null = null
  signedOut = false
  signIns = 0

  addChannel(id: string, teamName = 'team'): void {
    this.channels.push({ id, teamName, channelName: id })
  }

  myId(): Promise<string> {
    return this.signedOut ? Promise.reject(new TeamsSignedOut('signed out')) : Promise.resolve(ME)
  }

  signIn(): Promise<void> {
    this.signIns += 1
    return Promise.resolve()
  }

  invalidateSession(): void {
    // Nothing is cached here.
  }

  listChannels(): Promise<readonly TeamsChannel[]> {
    return Promise.resolve([...this.channels])
  }

  channelPage(channelId: string, backwardLink: string | null): Promise<TeamsMessagePage> {
    this.pageCalls.push([channelId, backwardLink])
    if (this.forbidden.has(channelId)) {
      return Promise.reject(new TeamsHttpError(403))
    }
    return Promise.resolve(this.pages.get(`${channelId}|${backwardLink ?? ''}`) ?? pageOf(null))
  }

  thread(channelId: string, rootId: string): Promise<TeamsThread> {
    const thread = this.threads.get(`${channelId}|${rootId}`)
    return thread === undefined ? Promise.reject(new TeamsHttpError(404)) : Promise.resolve(thread)
  }

  listChats(): Promise<readonly TeamsGroupChat[]> {
    return Promise.resolve([...this.chats])
  }

  chat(chatId: string): Promise<TeamsThread> {
    const thread = this.chatThreads.get(chatId)
    return thread === undefined ? Promise.reject(new TeamsHttpError(404)) : Promise.resolve(thread)
  }

  postReply(channelId: string, rootId: string, body: TeamsMessageBody): Promise<string> {
    return this.write(`${channelId};messageid=${rootId}`, null, body)
  }

  postMessage(channelId: string, subject: string, body: TeamsMessageBody): Promise<string> {
    return this.write(channelId, subject, body)
  }

  postChatMessage(chatId: string, body: TeamsMessageBody): Promise<string> {
    return this.write(chatId, null, body)
  }

  editMessage(conversationId: string, messageId: string, subject: string | null): Promise<void> {
    this.edits.push([conversationId, messageId, subject])
    return this.writeError === null ? Promise.resolve() : Promise.reject(this.writeError)
  }

  deleteMessage(conversationId: string, messageId: string): Promise<void> {
    this.deletes.push([conversationId, messageId])
    return this.writeError === null ? Promise.resolve() : Promise.reject(this.writeError)
  }

  setReaction(conversationId: string, messageId: string, key: string, add: boolean): Promise<void> {
    this.reactions.push([conversationId, messageId, key, add])
    return Promise.resolve()
  }

  image(url: string): Promise<TeamsImage> {
    this.imageCalls.push(url)
    return Promise.resolve({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' })
  }

  private write(
    conversationId: string,
    subject: string | null,
    body: TeamsMessageBody,
  ): Promise<string> {
    if (this.writeError !== null) {
      return Promise.reject(this.writeError)
    }
    this.sent.push({ conversationId, subject, body })
    return Promise.resolve(`sent-${String(this.sent.length)}`)
  }
}
