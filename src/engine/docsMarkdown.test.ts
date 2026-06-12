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

  it('keeps hard-wrapped list items in one bullet', () => {
    const blocks = parseMarkdown(`- **First.** A bullet whose text wraps
  onto an indented continuation line.
- Second bullet.

Next paragraph.
`)

    expect(blocks.map((block) => block.type)).toEqual(['list', 'paragraph'])
    const list = blocks[0] as Extract<(typeof blocks)[number], { type: 'list' }>
    expect(list.items).toHaveLength(2)
    expect(list.items[0]).toContainEqual({
      type: 'text',
      text: ' A bullet whose text wraps onto an indented continuation line.',
    })
  })

  it('parses ordered lists with wrapped items', () => {
    const blocks = parseMarkdown(`Steps:

1. First step that wraps
   onto another line.
2. Second step.
`)

    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list'])
    const list = blocks[1] as Extract<(typeof blocks)[number], { type: 'list' }>
    expect(list.ordered).toBe(true)
    expect(list.items).toHaveLength(2)
    expect(list.items[0]).toEqual([
      { type: 'text', text: 'First step that wraps onto another line.' },
    ])
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
