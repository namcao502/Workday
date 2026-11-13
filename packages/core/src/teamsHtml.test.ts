import { describe, expect, it } from 'vitest'
import { fullSizeImageUrl, isAmsImageUrl, safeHtml, toPlainText } from './teamsHtml.js'

const AMS = 'https://eu-api.asm.skype.com/v1/objects/0-weu-d1-abc123/views/imgo'

describe('safeHtml', () => {
  it('drops scripts, event handlers, javascript links and non-AMS images', () => {
    expect(safeHtml('<p>a</p><script>alert(1)</script><p>b</p>', false)).toBe('<p>a</p><p>b</p>')
    expect(safeHtml('<p onclick="x()" onmouseover=y()>t</p>', false)).toBe('<p>t</p>')
    expect(safeHtml('<img src="x" onerror="alert(1)">', false)).toBe('[image]')
    expect(safeHtml('<a href="javascript:alert(1)">go</a>', false)).toBe('go')
    expect(safeHtml('<a href=" JavaScript:alert(1)">go</a>', false)).toBe('go')
    expect(
      safeHtml('<img src="https://evil/x.png" itemtype="http://schema.skype.com/AMSImage">', false),
    ).toBe('[image]')
    expect(safeHtml('<img src="https://evil">', false)).toBe('[image]')
    expect(
      safeHtml('<style>body{display:none}</style>text<svg onload=x><a>q</a></svg>', false),
    ).toBe('text')
    expect(safeHtml('<iframe src="x"/>after', false)).toBe('after')
  })

  it('keeps only http(s) links and escapes the href', () => {
    expect(safeHtml('<a href="https://x.test/?a=1&amp;b=&quot;2">go</a>', false)).toBe(
      '<a href="https://x.test/?a=1&amp;b=&quot;2">go</a>',
    )
    expect(safeHtml('<a href="data:text/html,x">go</a>', false)).toBe('go')
  })

  it('renders mention, emoji and an AMS image; other spans lose their tag', () => {
    expect(
      safeHtml(
        '<span itemtype="http://schema.skype.com/Mention" itemid="0">Bob</span> <span style="x">y</span>',
        false,
      ),
    ).toBe('<span class="mention">Bob</span> y')
    expect(
      safeHtml('<img itemtype="http://schema.skype.com/Emoji" alt="(smile)" src="e.png">', false),
    ).toBe('(smile)')
    expect(safeHtml(`<img itemtype="http://schema.skype.com/AMSImage" src="${AMS}">`, false)).toBe(
      `<img class="ams" data-src="${AMS}" alt="image">`,
    )
  })

  it('escapes plain text and decoded entities', () => {
    expect(safeHtml('x < y & "z"', true)).toBe('x &lt; y &amp; &quot;z&quot;')
    expect(safeHtml('<p>&lt;b&gt;bold&lt;/b&gt; &#60;i&#62;</p>', false)).toBe(
      '<p>&lt;b&gt;bold&lt;/b&gt; &lt;i&gt;</p>',
    )
  })

  it('closes unbalanced and misnested tags', () => {
    expect(safeHtml('<p><b>a', false)).toBe('<p><b>a</b></p>')
    expect(safeHtml('<p><b>a</p>b</b>', false)).toBe('<p><b>a</b></p>b')
    expect(safeHtml('</i>x', false)).toBe('x')
  })
})

describe('AMS image urls', () => {
  it('rejects a query, fragment, trailing newline and other hosts', () => {
    expect(isAmsImageUrl(AMS)).toBe(true)
    expect(isAmsImageUrl(`${AMS}?x=1`)).toBe(false)
    expect(isAmsImageUrl(`${AMS}#x`)).toBe(false)
    expect(isAmsImageUrl(`${AMS}\n`)).toBe(false)
    expect(isAmsImageUrl('https://evil.test/v1/objects/a/views/imgo')).toBe(false)
    expect(isAmsImageUrl('http://eu-api.asm.skype.com/v1/objects/a/views/imgo')).toBe(false)
  })

  it('asks for the full-size view of the same object', () => {
    expect(fullSizeImageUrl(AMS)).toBe(AMS.replace('imgo', 'imgpsh_fullsize_anim'))
    expect(fullSizeImageUrl('https://evil.test/x')).toBeNull()
  })
})

describe('toPlainText', () => {
  it('turns breaks into lines, emoji into alt, images into a marker', () => {
    const html =
      '<p>a</p><p>b<br>c <img itemtype="http://schema.skype.com/Emoji" alt="(y)"> <img src="x"></p>'
    expect(toPlainText(html, false)).toBe('a\nb\nc (y) [image]')
    expect(toPlainText('  plain &amp; text ', true)).toBe('plain &amp; text')
  })
})

describe('hostile input stays linear', () => {
  const inputs: Record<string, string> = {
    'an unclosed quote': '<a href="'.repeat(22_000),
    'an unclosed quote after one tag': '<a "'.repeat(50_000),
    'one long attribute name': `<a ${'a'.repeat(200_000)}>x</a>`,
    'a long space run': `<p>a${' '.repeat(200_000)}b</p>`,
    'many unmatched closing tags': '<b>'.repeat(20_000) + '</zz>'.repeat(20_000),
    'many unterminated scripts': '<script>'.repeat(25_000),
    'many unterminated tags': '<a b'.repeat(50_000),
  }

  it.each(Object.entries(inputs))(
    'safeHtml and toPlainText handle %s in under 200 ms',
    (_name, input) => {
      const started = performance.now()
      safeHtml(input, false)
      toPlainText(input, false)
      expect(performance.now() - started).toBeLessThan(200)
    },
  )
})
