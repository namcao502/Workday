import { randomBytes } from 'node:crypto'
import {
  fullSizeImageUrl,
  isAmsImageUrl,
  parseChannels,
  parseChats,
  parseMessages,
  TeamsUncertain,
  type TeamsChannel,
  type TeamsChat,
  type TeamsGroupChat,
  type TeamsImage,
  type TeamsMessage,
  type TeamsMessageBody,
  type TeamsMessagePage,
  type TeamsThread,
} from '@workday/core'
import { retryTransient } from '../retry.js'
import { isChatListLink, parseArrivalTime } from './parseTeams.js'
import { TeamsHttp, TeamsHttpError, TeamsNoResponse, type TeamsRequest } from './teamsHttp.js'
import type { TeamsSession, TeamsSniffer } from './teamsSession.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_CHAT_LIST_PAGES = 3
const MESSAGE_VIEW = 'view=msnp24Equivalent&pageSize=200'
const CHAT_TARGET_TYPES =
  'Passport|Skype|Lync|Thread|Agent|ShortCircuit|PSTN|Flxt|NotificationStream|ModernBots|secureConversations|InteropBroadcast'
const FULL_SIZE_VIEW = /imgpsh_fullsize_anim$/
const CLIENT_ID_RANGE = 8_000_000_000_000_000_000n
const CLIENT_ID_FLOOR = 1_000_000_000_000_000_000n

// The chat API plus the visible sign-in, which only the client's own sniffer can run.
export type TeamsGateway = TeamsChat & { signIn(): Promise<void> }

type Build = (session: TeamsSession) => TeamsRequest

function enc(part: string): string {
  return encodeURIComponent(part)
}

// The 19-digit client id Teams expects on a new message.
function clientMessageId(): string {
  return String((randomBytes(8).readBigUInt64BE() % CLIENT_ID_RANGE) + CLIENT_ID_FLOOR)
}

// A message's preview image, or the full-size view of one.
function isLoadableImageUrl(url: string): boolean {
  if (isAmsImageUrl(url)) {
    return true
  }
  const preview = url.replace(FULL_SIZE_VIEW, 'imgo')
  return preview !== url && fullSizeImageUrl(preview) === url
}

function messageJson(body: TeamsMessageBody, subject: string | null): Record<string, unknown> {
  return {
    content: body.html,
    messagetype: 'RichText/Html',
    contenttype: 'text',
    amsreferences: [],
    properties: { importance: '', subject, mentions: body.mentionsJson, formatVariant: 'TEAMS' },
  }
}

function messageUrl(session: TeamsSession, conversationId: string, messageId: string): string {
  return `${session.chatUrl}conversations/${enc(conversationId)}/messages/${enc(messageId)}`
}

function chatGet(session: TeamsSession, path: string): TeamsRequest {
  return { method: 'GET', url: `${session.chatUrl}${path}`, token: 'chat' }
}

// Reads the body up to maxBytes; a body of unknown length is counted as it streams.
async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const body: ReadableStream<Uint8Array> | null = response.body
  if (body === null) {
    return Buffer.alloc(0)
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return Buffer.concat(chunks)
    }
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error('The Teams image is too large')
    }
    chunks.push(value)
  }
}

// Talks to Teams' internal chat API with the sniffed Bearer tokens only. Never logs a token, header or message.
export class TeamsChatClient implements TeamsChat {
  private readonly http: TeamsHttp

  constructor(
    sniffer: TeamsSniffer,
    fetchFunction: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.http = new TeamsHttp(sniffer, fetchFunction, now)
  }

  async myId(): Promise<string> {
    return (await this.http.session()).myId
  }

  signIn(): Promise<void> {
    return this.http.signIn()
  }

  invalidateSession(): void {
    this.http.invalidate()
  }

  async listChannels(): Promise<readonly TeamsChannel[]> {
    return parseChannels(
      await this.getJson((s) => ({
        method: 'GET',
        url: `${s.aggregatorUrl}api/v3/teams/users/me?isPrefetch=false&enableMembershipSummary=true`,
        token: 'aggregator',
      })),
    )
  }

  async channelPage(channelId: string, backwardLink: string | null): Promise<TeamsMessagePage> {
    const json = await this.getJson((s) => {
      if (backwardLink === null) {
        return chatGet(s, `conversations/${enc(channelId)}/messages?${MESSAGE_VIEW}`)
      }
      if (!backwardLink.startsWith(s.chatUrl)) {
        throw new Error('Teams page link points to an unexpected host')
      }
      return { method: 'GET', url: backwardLink, token: 'chat' }
    })
    return parseMessages(json)
  }

  async thread(channelId: string, rootId: string): Promise<TeamsThread> {
    const conversation = enc(`${channelId};messageid=${rootId}`)
    const messages = await this.readMessages(
      `conversations/${conversation}/messages?${MESSAGE_VIEW}`,
    )
    const thread = (list: readonly TeamsMessage[]): TeamsThread => ({
      conversationId: channelId,
      rootId,
      messages: list,
      isChat: false,
    })
    if (messages.some((message) => message.id !== rootId)) {
      return thread(messages)
    }
    // Teams sometimes returns only the root (seen after a reaction on it); the channel's newest page still holds the replies.
    const page = await this.readMessages(`conversations/${enc(channelId)}/messages?${MESSAGE_VIEW}`)
    const replies = page.filter((m) => m.rootMessageId === rootId && m.id !== rootId)
    return thread(
      [...messages, ...replies].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)),
    )
  }

  async listChats(): Promise<readonly TeamsGroupChat[]> {
    const chats: TeamsGroupChat[] = []
    let link: string | null = null
    for (let pageIndex = 0; pageIndex < MAX_CHAT_LIST_PAGES; pageIndex += 1) {
      const nextLink: string | null = link
      if (nextLink !== null && !isChatListLink(nextLink, (await this.http.session()).chatUrl)) {
        break
      }
      const firstPath = `conversations?view=msnp24Equivalent&pageSize=100&targetType=${CHAT_TARGET_TYPES}&startTime=0`
      const json = await this.getJson((s) =>
        nextLink === null ? chatGet(s, firstPath) : { method: 'GET', url: nextLink, token: 'chat' },
      )
      const page = parseChats(json)
      chats.push(...page.chats)
      link = page.backwardLink
      if (link === null || link === '') {
        break
      }
    }
    return chats
  }

  async chat(chatId: string): Promise<TeamsThread> {
    const messages = await this.readMessages(
      `conversations/${enc(chatId)}/messages?${MESSAGE_VIEW}`,
    )
    return { conversationId: chatId, rootId: '', messages, isChat: true }
  }

  postChatMessage(chatId: string, body: TeamsMessageBody): Promise<string> {
    return this.post(chatId, null, body)
  }

  postReply(channelId: string, rootId: string, body: TeamsMessageBody): Promise<string> {
    return this.post(`${channelId};messageid=${rootId}`, null, body)
  }

  postMessage(channelId: string, subject: string, body: TeamsMessageBody): Promise<string> {
    return this.post(channelId, subject, body)
  }

  editMessage(
    conversationId: string,
    messageId: string,
    subject: string | null,
    body: TeamsMessageBody,
  ): Promise<void> {
    return this.change((s) => ({
      method: 'PUT',
      url: messageUrl(s, conversationId, messageId),
      token: 'chat',
      json: messageJson(body, subject),
    }))
  }

  deleteMessage(conversationId: string, messageId: string): Promise<void> {
    return this.change((s) => ({
      method: 'DELETE',
      url: `${messageUrl(s, conversationId, messageId)}?behavior=softDelete`,
      token: 'chat',
    }))
  }

  // The time goes in the body only when adding.
  setReaction(conversationId: string, messageId: string, key: string, add: boolean): Promise<void> {
    return this.change((s) => ({
      method: add ? 'PUT' : 'DELETE',
      url: `${messageUrl(s, conversationId, messageId)}/properties?name=emotions`,
      token: 'chat',
      json: { emotions: add ? { key, value: Date.now() } : { key } },
    }))
  }

  async image(url: string): Promise<TeamsImage> {
    if (!isLoadableImageUrl(url)) {
      throw new Error('Teams image link points to an unexpected host')
    }
    // A redirect is an error, so the token never leaves the AMS host.
    const response = await retryTransient(() =>
      this.http.send(() => ({ method: 'GET', url, token: 'chat', asBrowser: true }), {
        followRedirects: false,
      }),
    )
    if (!response.ok) {
      throw new TeamsHttpError(response.status)
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!/^image\//i.test(contentType)) {
      throw new Error('Teams answered the image request with something that is not an image')
    }
    if (Number(response.headers.get('content-length') ?? '0') > MAX_IMAGE_BYTES) {
      throw new Error('The Teams image is too large')
    }
    return { bytes: await readLimited(response, MAX_IMAGE_BYTES), contentType }
  }

  private async readMessages(path: string): Promise<readonly TeamsMessage[]> {
    return parseMessages(await this.getJson((s) => chatGet(s, path))).messages
  }

  // GETs are retried when no response came back; never on an HTTP status.
  private async getJson(build: Build): Promise<unknown> {
    const response = await retryTransient(() => this.http.send(build))
    if (!response.ok) {
      throw new TeamsHttpError(response.status)
    }
    return await response.json()
  }

  private async change(build: Build): Promise<void> {
    const response = await this.sendWrite(build)
    await response.body?.cancel().catch(() => undefined)
  }

  private async post(
    conversationId: string,
    subject: string | null,
    body: TeamsMessageBody,
  ): Promise<string> {
    const response = await this.sendWrite((s) => ({
      method: 'POST',
      url: `${s.chatUrl}conversations/${enc(conversationId)}/messages`,
      token: 'chat',
      json: {
        ...messageJson(body, subject),
        clientmessageid: clientMessageId(),
        imdisplayname: s.myName,
      },
    }))
    let id: string | null
    try {
      id = parseArrivalTime(await response.json())
    } catch {
      throw new TeamsUncertain('Teams answered the post with an unreadable body')
    }
    if (id === null) {
      throw new TeamsUncertain('Teams accepted the message but did not return its id')
    }
    return id
  }

  // A write is never retried: no answer, a timeout or a 5xx may still have reached Teams.
  private async sendWrite(build: Build): Promise<Response> {
    let response: Response
    try {
      response = await this.http.send(build)
    } catch (error: unknown) {
      if (error instanceof TeamsNoResponse) {
        throw new TeamsUncertain('The request failed; it may have been applied', { cause: error })
      }
      throw error
    }
    if (response.status >= 500) {
      throw new TeamsUncertain(
        `Teams answered ${String(response.status)}; it may have been applied`,
      )
    }
    if (!response.ok) {
      throw new TeamsHttpError(response.status)
    }
    return response
  }
}
