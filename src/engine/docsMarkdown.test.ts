import { extractHeadings, parseInline, parseMarkdown, slugifyHeading } from './docsMarkdown'

describe('docsMarkdown', () => {
  it('parses headings, paragraphs, tables, images, lists, and code fences', () => {
    const blocks = parseMarkdown(`# Title

Intro with **strong** and \`code\`.

![Diagram](../images/example.svg)

| Name | Value |
|---|---|
| \`speed\` | Fast |

- one
- two

> quoted line

---

\`\`\`js
export function render() {}
\`\`\`
`)

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'image',
      'table',
      'list',
      'blockquote',
      'rule',
      'code',
    ])
    expect(extractHeadings(blocks)).toEqual([{ level: 1, text: 'Title', id: 'title' }])
  })

  it('creates stable duplicate heading ids', () => {
    const used = new Map<string, number>()
    expect(slugifyHeading('Maps & Embeddings', used)).toBe('maps-and-embeddings')
    expect(slugifyHeading('Maps & Embeddings', used)).toBe('maps-and-embeddings-2')
  })

  it('parses inline emphasis, code, and links without allowing raw html', () => {
    expect(parseInline('Use **bold `code`** and [docs](https://example.com).')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'strong', children: [{ type: 'text', text: 'bold ' }, { type: 'code', text: 'code' }] },
      { type: 'text', text: ' and ' },
      { type: 'link', href: 'https://example.com', children: [{ type: 'text', text: 'docs' }] },
      { type: 'text', text: '.' },
    ])
  })
})
