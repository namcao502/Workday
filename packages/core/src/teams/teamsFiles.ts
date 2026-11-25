// Files attached to a Teams message: the name SharePoint takes, the team site the token may go to,
// and properties.files as Teams' own client writes it (a port of the C# TeamsFiles).

const FILE_ITEM_TYPE = 'http://schema.skype.com/File'
export const CHAT_FILES_FOLDER = 'Microsoft Teams Chat Files'
const MY_HOST_SUFFIX = '-my.sharepoint.com'
const MAX_FILE_NAME_LENGTH = 120
const FIRST_PRINTABLE_CODE = 32
const BACKSLASH = String.fromCharCode(92)
const INVALID_NAME_CHARACTERS = new Set(['"', '*', ':', '<', '>', '?', '/', BACKSLASH, '|'])

export interface TeamsUploadedFile {
  readonly fileName: string
  readonly webUrl: string
  readonly siteUrl: string
  readonly shareUrl: string | null // a chat file opens through its organization link
  readonly sharepointIds: Readonly<Record<string, unknown>>
  readonly isChat: boolean
  readonly itemId: string // with driveUrl: where to delete it again
  readonly driveUrl: string
}

// A plain name SharePoint takes: no folders, none of the characters it refuses, no trailing dot or space.
export function sharePointName(name: string): string {
  const last = name.split(/[/\\]/).pop() ?? ''
  const kept = Array.from(last)
    .filter(
      (char) => !INVALID_NAME_CHARACTERS.has(char) && char.charCodeAt(0) >= FIRST_PRINTABLE_CODE,
    )
    .join('')
    .trim()
    .replace(/\.+$/, '')
  return kept === '' ? 'file' : kept.slice(0, MAX_FILE_NAME_LENGTH)
}

// The token goes only to the tenant the user's OneDrive is in: "x-my.sharepoint.com" -> "x.sharepoint.com/sites|teams/<name>".
export function isTeamSiteUrl(siteUrl: string | null | undefined, oneDriveHost: string): boolean {
  if (siteUrl === null || siteUrl === undefined || !URL.canParse(siteUrl)) {
    return false
  }
  const url = new URL(siteUrl)
  const host = oneDriveHost.toLowerCase()
  if (url.protocol !== 'https:' || url.search !== '' || !host.endsWith(MY_HOST_SUFFIX)) {
    return false
  }
  const tenantHost = `${host.slice(0, -MY_HOST_SUFFIX.length)}.sharepoint.com`
  const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
  return (
    url.hostname.toLowerCase() === tenantHost &&
    segments.length === 2 &&
    (segments[0] === 'sites' || segments[0] === 'teams') &&
    (segments[1] ?? '') !== ''
  )
}

// A chat file opens through its organization link (serviceName p2p); a channel file sits in the team's folder (teams).
export function filesJson(files: readonly TeamsUploadedFile[]): string {
  return JSON.stringify(
    files.map((file) => {
      const uniqueId = file.sharepointIds['listItemUniqueId']
      const id = typeof uniqueId === 'string' ? uniqueId : null
      const extension = (file.fileName.split('.').pop() ?? '').toLowerCase()
      const type = file.fileName.includes('.') ? extension : ''
      return {
        '@type': FILE_ITEM_TYPE,
        version: 2,
        id,
        itemid: id,
        fileName: file.fileName,
        fileType: type,
        type,
        title: file.fileName,
        baseUrl: file.siteUrl,
        objectUrl: file.webUrl,
        fileInfo: {
          itemId: null,
          fileUrl: file.webUrl,
          siteUrl: file.siteUrl,
          serverRelativeUrl: '',
          shareUrl: file.shareUrl,
          shareId: null,
        },
        fileChicletState: { serviceName: file.isChat ? 'p2p' : 'teams', state: 'active' },
        state: 'active',
        botFileProperties: {},
        filePreview: { previewUrl: '', previewHeight: null, previewWidth: null },
        sharepointIds: file.sharepointIds,
        ...(file.isChat ? { permissionScope: 'organization' } : {}),
      }
    }),
  )
}
