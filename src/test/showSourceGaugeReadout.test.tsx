import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
  READOUT_SEPARATOR,
  readoutTokensFromTextNodes,
  selectReadoutNumeratorNode,
} from './showSourceGaugeExceptionOracle'

/**
 * Proves the readout shape against React-rendered DOM rather than a modelled one.
 *
 * The editor's portal gauge renders its readout as
 * `<span>{formatBytes(deliveredBytes)} / {formatBytes(summary.measuredDeviceBudgetBytes)}</span>`
 * (`src/components/ShowEditor.tsx`). React emits **three** text nodes from that, and both the
 * numerator and the denominator match the same numeric token pattern. Selecting "the numeric text
 * node" therefore finds two and is not a usable selector; only the position in the closed shape is.
 */

/** The product's readout JSX, reproduced verbatim so React builds the same children. */
function Readout({ delivered, budget }: { delivered: string; budget: string }) {
  return <span>{delivered} / {budget}</span>
}

function renderReadout(delivered = '7.0 KB', budget = '66.8 KB'): HTMLElement {
  const { container } = render(<Readout delivered={delivered} budget={budget} />)
  return container.firstElementChild as HTMLElement
}

describe('the rendered source-size readout', () => {
  it('really renders three text nodes, both of them numeric', () => {
    const readout = renderReadout()
    const nodes = [...readout.childNodes]
    expect(nodes).toHaveLength(3)
    expect(nodes.every(node => node.nodeType === Node.TEXT_NODE)).toBe(true)
    expect(nodes.map(node => node.nodeValue)).toEqual(['7.0 KB', READOUT_SEPARATOR, '66.8 KB'])
    // The defect this guards: a "single numeric text node" rule matches two of these.
    const numeric = nodes.filter(node => /^\d+(\.\d+)? (B|KB|MB)$/.test(node.nodeValue ?? ''))
    expect(numeric).toHaveLength(2)
    expect(readout.textContent).toBe('7.0 KB / 66.8 KB')
  })

  it('selects the numerator node and leaves the separator and denominator alone', () => {
    const readout = renderReadout()
    const numerator = selectReadoutNumeratorNode(readout)
    expect(numerator).toBe(readout.childNodes[0])

    numerator.nodeValue = '7.2 KB'
    expect(readout.childNodes).toHaveLength(3)
    expect([...readout.childNodes].map(node => node.nodeValue)).toEqual(['7.2 KB', READOUT_SEPARATOR, '66.8 KB'])
    expect(readout.textContent).toBe('7.2 KB / 66.8 KB')
  })

  it('never returns the denominator, even when it is the wider number', () => {
    const readout = renderReadout('512 B', '66.8 KB')
    expect(selectReadoutNumeratorNode(readout).nodeValue).toBe('512 B')
  })

  it('refuses a readout that is not the closed shape', () => {
    // A textContent-style rewrite collapses the three nodes into one.
    const collapsed = renderReadout()
    collapsed.textContent = '7.0 KB / 66.8 KB'
    expect(() => selectReadoutNumeratorNode(collapsed)).toThrow(/not the expected shape/)

    const extraNode = renderReadout()
    extraNode.appendChild(document.createTextNode(' 1.0 KB'))
    expect(() => selectReadoutNumeratorNode(extraNode)).toThrow(/not the expected shape/)

    const withElement = renderReadout()
    withElement.replaceChild(document.createElement('b'), withElement.childNodes[0])
    expect(() => selectReadoutNumeratorNode(withElement)).toThrow(/not the expected shape/)

    const reworded = renderReadout()
    reworded.childNodes[1].nodeValue = ' of '
    expect(() => selectReadoutNumeratorNode(reworded)).toThrow(/not the expected shape/)

    const unitless = renderReadout()
    unitless.childNodes[2].nodeValue = '66.8'
    expect(() => selectReadoutNumeratorNode(unitless)).toThrow(/not the expected shape/)
  })
})

describe('reading the collected readout text nodes', () => {
  it('reads the numerator and denominator from the closed shape', () => {
    expect(readoutTokensFromTextNodes(['7.0 KB', READOUT_SEPARATOR, '66.8 KB']))
      .toEqual({ numerator: '7.0 KB', denominator: '66.8 KB' })
    expect(readoutTokensFromTextNodes(['512 B', READOUT_SEPARATOR, '66.8 KB']))
      .toEqual({ numerator: '512 B', denominator: '66.8 KB' })
  })

  it('refuses anything else rather than guessing which value is which', () => {
    for (const nodes of [
      ['7.0 KB / 66.8 KB'],
      ['7.0 KB', READOUT_SEPARATOR],
      ['7.0 KB', ' of ', '66.8 KB'],
      ['7.0 KB', READOUT_SEPARATOR, '66.8'],
      ['', READOUT_SEPARATOR, '66.8 KB'],
      ['7.0 KB', READOUT_SEPARATOR, '66.8 KB', ' extra'],
    ]) {
      expect(readoutTokensFromTextNodes(nodes), nodes.join('|')).toBeNull()
    }
  })

  it('agrees with the rendered DOM it describes', () => {
    const readout = renderReadout()
    const textNodes = [...readout.childNodes].map(node => node.nodeValue ?? '')
    const tokens = readoutTokensFromTextNodes(textNodes)
    expect(tokens?.numerator).toBe(selectReadoutNumeratorNode(readout).nodeValue)
    expect(tokens?.denominator).toBe(readout.childNodes[2].nodeValue)
  })
})
