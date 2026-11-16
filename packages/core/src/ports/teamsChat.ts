import type { TeamsMessageBody } from '../teamsCompose.js'
import type { TeamsUploadedFile } from '../teamsFiles.js'
import type { TeamsChannel, TeamsGroupChat, TeamsMessagePage, TeamsThread } from '../teamsChat.js'

export interface TeamsImage {
  readonly bytes: Uint8Array
  readonly contentType: string
}

export interface TeamsImageUpload extends TeamsImage {
  readonly fileName: string
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
  setReaction(conversationId: string, messageId: string, key: string, add: boolean): Promise<void>
  image(url: string): Promise<TeamsImage>
  // Uploads to the object store, readable in the conversation; returns the object id for amsreferences.
  uploadImage(conversationId: string, image: TeamsImageUpload): Promise<string>
  // A chat's file goes to the user's OneDrive, a channel's to its folder on the team site.
  uploadFile(
    file: { readonly fileName: string; readonly bytes: Uint8Array },
    channel: TeamsChannel | null,
  ): Promise<TeamsUploadedFile>
  invalidateSession(): void
}

// The saved Teams sign-in is gone or was rejected; the user has to sign in again.
export class TeamsSignedOut extends Error {}

// A sign-in or sniff already holds the Teams browser profile.
export class TeamsBusy extends Error {}

// A write that may have reached Teams: the caller must not blindly retry it.
export class TeamsUncertain extends Error {}
