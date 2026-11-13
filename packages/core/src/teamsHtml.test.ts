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

// Wall-clock limits flake under parallel test load, so growth is compared instead:
// quadratic work grows ~16x from n to 4n, linear ~4x.
function fastestMs(run: () => void): number {
  let fastest = Number.POSITIVE_INFINITY
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - started)
  }
  return fastest
}

describe('hostile input stays linear', () => {
  const inputs: Record<string, (count: number) => string> = {
    'an unclosed quote': (count) => '<a href="'.repeat(count),
    'an unclosed quote after one tag': (count) => '<a "'.repeat(count),
    'one long attribute name': (count) => `<a ${'a'.repeat(count * 10)}>x</a>`,
    'a long space run': (count) => `<p>a${' '.repeat(count * 10)}b</p>`,
    'many unmatched closing tags': (count) => '<b>'.repeat(count) + '</zz>'.repeat(count),
    'many unterminated scripts': (count) => '<script>'.repeat(count),
    'many unterminated tags': (count) => '<a b'.repeat(count),
  }

  it.each(Object.entries(inputs))('safeHtml and toPlainText stay linear on %s', (_name, build) => {
    const parse = (input: string): void => {
      safeHtml(input, false)
      toPlainText(input, false)
    }
    const small = fastestMs(() => {
      parse(build(5_000))
    })
    const large = fastestMs(() => {
      parse(build(20_000))
    })
    expect(large).toBeLessThan(small * 10 + 50)
    expect(large).toBeLessThan(2_000)
  })
})
