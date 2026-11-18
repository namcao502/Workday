import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import ini from 'highlight.js/lib/languages/ini'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const LANGUAGES = {
  bash,
  csharp,
  css,
  ini,
  javascript,
  json,
  markdown,
  powershell,
  python,
  scss,
  sql,
  typescript,
  xml,
  yaml,
}
for (const [name, language] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, language)
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  cs: 'csharp',
  csx: 'csharp',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  csproj: 'xml',
  props: 'xml',
  targets: 'xml',
  config: 'xml',
  resx: 'xml',
  xaml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  sh: 'bash',
  bash: 'bash',
  ps1: 'powershell',
  psm1: 'powershell',
  py: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  ini: 'ini',
  toml: 'ini',
  editorconfig: 'ini',
}

// Past this size highlighting a file would stall the page; it is shown plain.
const MAX_HIGHLIGHT_CHARS = 300_000

export function languageOf(path: string): string | null {
  const name = path.split('/').at(-1) ?? ''
  const extension = name.includes('.') ? (name.split('.').at(-1) ?? '') : name
  return EXTENSIONS[extension.toLowerCase()] ?? null
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Splits highlighted HTML at newlines; a span open across a newline is closed and reopened, so each line stands alone.
function splitHtmlLines(html: string): readonly string[] {
  const lines: string[] = []
  const open: string[] = []
  let current = ''
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === '\n') {
      lines.push(current + '</span>'.repeat(open.length))
      current = open.join('')
    } else if (part.startsWith('<span')) {
      open.push(part)
      current += part
    } else if (part === '</span>') {
      open.pop()
      current += part
    } else {
      current += part
    }
  }
  lines.push(current)
  return lines
}

// One HTML string per line of the text (escaped, safe for innerHTML).
export function highlightLines(text: string, language: string | null): readonly string[] {
  if (
    language === null ||
    text.length > MAX_HIGHLIGHT_CHARS ||
    hljs.getLanguage(language) === undefined
  ) {
    return text.split('\n').map(escapeHtml)
  }
  return splitHtmlLines(hljs.highlight(text, { language, ignoreIllegals: true }).value)
}

// A code block with no language (Teams): the best guess among the registered ones.
export function highlightAuto(text: string): string {
  if (text.length > MAX_HIGHLIGHT_CHARS) {
    return escapeHtml(text)
  }
  return hljs.highlightAuto(text, Object.keys(LANGUAGES)).value
}
