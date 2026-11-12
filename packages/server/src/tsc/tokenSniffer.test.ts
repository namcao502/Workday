import { describe, expect, it } from 'vitest'
import { isSignedInUrl } from './tokenSniffer.js'

const SHARE_URL =
  'https://example-my.sharepoint.com/:x:/r/personal/someone/_layouts/15/doc2.aspx?file=a.xlsx'

describe('isSignedInUrl', () => {
  it('is signed in on the share host even when the query mentions login', () => {
    const url =
      'https://example-my.sharepoint.com/:x:/r/personal/someone/_layouts/15/doc2.aspx?login_hint=me'
    expect(isSignedInUrl(url, SHARE_URL)).toBe(true)
  })

  it('is signed out on the Microsoft login host', () => {
    expect(
      isSignedInUrl('https://login.microsoftonline.com/common/oauth2/authorize', SHARE_URL),
    ).toBe(false)
  })

  it('is signed out on a login path of the share host', () => {
    expect(isSignedInUrl('https://example-my.sharepoint.com/_forms/login.aspx', SHARE_URL)).toBe(
      false,
    )
  })
})
