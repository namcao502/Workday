import type { TeamsMessageBody } from '../teamsCompose.js'
import type {
  TeamsChannel,
  TeamsGroupChat,
  TeamsMessagePage,
  TeamsThread,
} from '../teamsChat.js'

export interface TeamsImage {
  readonly bytes: Uint8Array
  readonly contentType: string
}

export interface TeamsChat {
  myId(): Promise<string>
  listChannels(): Promise<readonly TeamsChannel[]>
  channelPage(channelId: string, backwardLink: string | null): Promise<TeamsMessagePage>
  thread(channelId: string, rootId: string): Promise<TeamsThread>
  listChats(): Promise<readonly TeamsGroupChat[]>
  chat(chatId: string): Promise<TeamsThread>
  postReply(channelId: string, rootId: string, body: TeamsMessageBody): Promise<string>
  postMessage(channelId: string, subject: string, body: TeamsMessageBody): Promise<string>
  postChatMessage(chatId: string, body: TeamsMessageBody): Promise<string>
  editMessage(
    conversationId: string,
    messageId: string,
    subject: string | null,
    body: TeamsMessageBody,
  ): Promise<void>
  deleteMessage(conversationId: string, messageId: string): Promise<void>
  setReaction(
    conversationId: string,
    messageId: string,
    key: string,
    add: boolean,
  ): Promise<void>
  image(url: string): Promise<TeamsImage>
  invalidateSession(): void
}

// The saved Teams sign-in is gone or was rejected; the user has to sign in again.
export class TeamsSignedOut extends Error {}

// A sign-in or sniff already holds the Teams browser profile.
export class TeamsBusy extends Error {}

// A write that may have reached Teams: the caller must not blindly retry it.
export class TeamsUncertain extends Error {}
