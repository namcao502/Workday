import { expect, it } from 'vitest'
import { filesJson, isTeamSiteUrl, sharePointName, type TeamsUploadedFile } from './teamsFiles.js'

it('keeps only a plain file name', () => {
  const back = String.fromCharCode(92)
  expect(sharePointName(`C:${back}docs${back}report: v2?.pdf`)).toBe('report v2.pdf')
  expect(sharePointName('name.')).toBe('name')
  expect(sharePointName('///')).toBe('file')
})

it('lets the token go only to the tenant team site of the user OneDrive', () => {
  const host = 'monster-my.sharepoint.com'
  expect(isTeamSiteUrl('https://monster.sharepoint.com/sites/Task', host)).toBe(true)
  expect(isTeamSiteUrl('https://monster.sharepoint.com/teams/x/', host)).toBe(true)
  expect(isTeamSiteUrl('https://evil.sharepoint.com/sites/Task', host)).toBe(false)
  expect(isTeamSiteUrl('http://monster.sharepoint.com/sites/Task', host)).toBe(false)
  expect(isTeamSiteUrl('https://monster.sharepoint.com/sites/Task?x=1', host)).toBe(false)
  expect(isTeamSiteUrl('https://monster.sharepoint.com/sites/a/b', host)).toBe(false)
  expect(isTeamSiteUrl(null, host)).toBe(false)
})

const UPLOADED: TeamsUploadedFile = {
  fileName: 'Doc.PDF',
  webUrl: 'https://t.sharepoint.com/sites/x/Doc.PDF',
  siteUrl: 'https://t.sharepoint.com/sites/x',
  shareUrl: 'https://t.sharepoint.com/:b:/s/x/abc',
  sharepointIds: { listItemUniqueId: 'uid-1' },
  isChat: true,
  itemId: 'i',
  driveUrl: 'd',
}

it('writes properties.files like Teams: a chat file by organization link, a channel file not', () => {
  const [chat] = JSON.parse(filesJson([UPLOADED])) as Record<string, unknown>[]
  expect(chat).toMatchObject({
    '@type': 'http://schema.skype.com/File',
    id: 'uid-1',
    fileType: 'pdf',
    permissionScope: 'organization',
    fileChicletState: { serviceName: 'p2p', state: 'active' },
  })
  const [channel] = JSON.parse(
    filesJson([{ ...UPLOADED, isChat: false, shareUrl: null }]),
  ) as Record<string, unknown>[]
  expect(channel).toMatchObject({ fileChicletState: { serviceName: 'teams' } })
  expect(channel).not.toHaveProperty('permissionScope')
})
