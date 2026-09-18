/**
 * The one serialization rule behind a surface-state fingerprint (#1065).
 *
 * This file deliberately imports nothing. The canonical harness collects the structured surface in
 * the page and hashes it there through `crypto.subtle`, while `showCaptureRasterNoiseClassifier`
 * hashes the same string in Node, so both sides must be able to load exactly this module.
 *
 * Only a verified value is replaced, and only inside the one fixed field that carries it. The rest
 * of that field, and every other node, attribute, text node, rect and collected style, is serialized
 * verbatim - so a same-looking number anywhere else in the surface still separates two surfaces.
 */

export interface PixelBox { x: number; y: number; width: number; height: number }

/** One node of the collector's structured surface evidence, in document order. */
export interface SurfaceNodeEvidence {
  /** Stable structural path from the surface root, e.g. `0/2/1`. */
  path: string
  tag: string
  attributes: Readonly<Record<string, string>>
  textNodes: readonly string[]
  rect: PixelBox
  computedStyle: Readonly<Record<string, string>>
  pseudoStyle: Readonly<Record<string, Readonly<Record<string, string>>>>
}

/**
 * One approved value occurrence: the node carrying it, the field within that node, and the value
 * itself, already verified against the delivered artifact. The only permitted source is the
 * harness's fixed gauge slot definition; there is no selector option and no caller-chosen token list.
 */
export interface FixedValueField {
  path: string
  field:
    | { kind: 'attribute'; name: string }
    | { kind: 'text-node'; index: number }
  value: string
}

const FIXED_VALUE_PLACEHOLDER = ' fixed-value '

/**
 * Serializes the collected surface with each verified value replaced inside its own fixed field. A
 * field the surface does not carry, or a value that is not in that field exactly once, throws rather
 * than silently replacing nothing or guessing which occurrence was meant.
 */
export function serializeSurfaceState(
  nodes: readonly SurfaceNodeEvidence[],
  fixedValueFields: readonly FixedValueField[],
): string {
  const replaced = nodes.map(node => ({
    ...node,
    attributes: { ...node.attributes },
    textNodes: [...node.textNodes],
  }))
  for (const { path, field, value } of fixedValueFields) {
    const node = replaced.find(entry => entry.path === path)
    if (!node) throw new Error(`The collected surface carries no node at "${path}" for a fixed value field.`)
    const current = field.kind === 'attribute' ? node.attributes[field.name] : node.textNodes[field.index]
    if (current === undefined) {
      const missing = field.kind === 'attribute' ? `${field.name} attribute` : `text node ${field.index}`
      throw new Error(`The node at "${path}" carries no ${missing} for a fixed value field.`)
    }
    const occurrences = value ? current.split(value).length - 1 : 0
    if (occurrences !== 1) {
      throw new Error(`The verified value "${value}" does not appear exactly once in the fixed field at`
        + ` "${path}"; it appeared ${occurrences} time(s), so no occurrence may be replaced.`)
    }
    const substituted = current.replace(value, FIXED_VALUE_PLACEHOLDER)
    if (field.kind === 'attribute') node.attributes[field.name] = substituted
    else node.textNodes[field.index] = substituted
  }
  return stableSerialize(replaced)
}

/** Key-ordered serialization, so two collections of the same surface cannot differ by key order. */
export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
