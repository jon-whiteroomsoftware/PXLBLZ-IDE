import { useMemo } from 'react'
import { resolveDocAsset, resolveDocHref, type UserDoc } from '@/docs/catalog'
import {
  parseMarkdown,
  type InlineNode,
  type MarkdownBlock,
} from '@/engine/docsMarkdown'

function Inline({ nodes, doc }: { nodes: InlineNode[]; doc: UserDoc }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'text') return <span key={index}>{node.text}</span>
        if (node.type === 'strong') return <strong key={index}><Inline nodes={node.children} doc={doc} /></strong>
        if (node.type === 'code') return <code key={index}>{node.text}</code>
        const href = resolveDocHref(doc, node.href)
        return (
          <a key={index} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            <Inline nodes={node.children} doc={doc} />
          </a>
        )
      })}
    </>
  )
}

function TableBlock({ block, doc }: { block: Extract<MarkdownBlock, { type: 'table' }>; doc: UserDoc }) {
  return (
    <div className="my-5 overflow-x-auto rounded border border-seam bg-zinc-950/40">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead>
          <tr>
            {block.headers.map((cell, index) => (
              <th key={index} className="border-b border-seam bg-zinc-900 px-3 py-1.5 font-mono font-semibold text-zinc-200">
                <Inline nodes={cell} doc={doc} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-zinc-950/30 even:bg-zinc-900/20">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-t border-seam/70 px-3 py-1.5 align-top text-zinc-300">
                  <Inline nodes={cell} doc={doc} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BlockView({ block, doc }: { block: MarkdownBlock; doc: UserDoc }) {
  if (block.type === 'heading') {
    const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3')
    const className =
      block.level === 1
        ? 'mt-0 mb-4 border-b border-seam pb-3 font-mono text-xl font-semibold tracking-normal text-zinc-100'
        : block.level === 2
          ? 'mt-7 mb-2.5 font-mono text-base font-semibold tracking-normal text-zinc-100'
          : 'mt-5 mb-1.5 font-mono text-[0.8125rem] leading-5 font-semibold tracking-normal text-zinc-200'
    return <Tag id={block.id} className={className}>{block.text}</Tag>
  }
  if (block.type === 'paragraph') {
    return <p className="my-2.5 leading-5 text-zinc-300"><Inline nodes={block.children} doc={doc} /></p>
  }
  if (block.type === 'blockquote') {
    return (
      <blockquote className="my-4 border-l-2 border-live/60 bg-zinc-900/40 py-1.5 pl-4 pr-3 leading-5 text-zinc-300">
        <Inline nodes={block.children} doc={doc} />
      </blockquote>
    )
  }
  if (block.type === 'list') {
    return (
      <ul className="my-3 list-disc space-y-1.5 pl-5 leading-5 text-zinc-300 marker:text-live/80">
        {block.items.map((item, index) => <li key={index}><Inline nodes={item} doc={doc} /></li>)}
      </ul>
    )
  }
  if (block.type === 'code') {
    return (
      <pre className="my-4 overflow-x-auto rounded border border-seam bg-zinc-950 p-3 text-xs leading-5 text-zinc-200">
        <code>{block.code}</code>
      </pre>
    )
  }
  if (block.type === 'table') return <TableBlock block={block} doc={doc} />
  if (block.type === 'rule') return <hr className="my-6 border-seam" />
  return (
    <figure className="my-5 rounded border border-seam bg-zinc-950/50 p-3">
      <img
        src={resolveDocAsset(doc, block.src)}
        alt={block.alt}
        className="mx-auto max-h-[520px] w-full max-w-3xl object-contain"
      />
      {block.alt && <figcaption className="mt-2 text-center text-[11px] text-zinc-500">{block.alt}</figcaption>}
    </figure>
  )
}

export function DocsReader({ doc }: { doc: UserDoc }) {
  const blocks = useMemo(() => parseMarkdown(doc.source), [doc.source])

  return (
    <div data-testid="docs-reader" className="h-full overflow-hidden bg-zinc-950 text-[0.8125rem]">
      <div className="flex h-full min-h-0">
        <article className="docs-article flex-1 overflow-y-auto px-5 py-5 lg:px-8">
          <div className="mx-auto max-w-4xl">
            {blocks.map((block, index) => <BlockView key={index} block={block} doc={doc} />)}
          </div>
        </article>
      </div>
    </div>
  )
}
