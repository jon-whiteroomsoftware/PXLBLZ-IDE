import { describe, expect, it } from 'vitest'
import {
  classifyRasterNoise,
  surfaceStateFingerprint,
  type CaptureEvidence,
  type ChangedPixel,
  type ControlGroup,
  type RasterNoiseInput,
  type RenderState,
  type Rgba,
  type SurfaceNodeEvidence,
} from './showCaptureRasterNoiseClassifier'

/**
 * The classifier is exercised with the one residual the #1065 discrimination run actually left: the
 * six-pixel difference between v2's raw capture and its restored capture at (366-371, 256-257),
 * every channel delta 1. Each case asks whether one specific wrong thing still classifies. Nothing
 * may pass on a count, a delta, a region, a neighbour, or colours pooled across two stable versions.
 */

const A: Rgba = [29, 29, 34, 255]
const B: Rgba = [29, 29, 33, 255]
const C: Rgba = [30, 29, 34, 255]
const POSITION = { x: 366, y: 256 }
const FINGERPRINT = 'sha256:preview-strip-delivered'
const POLICY = 'full surface DOM, geometry and collected styles; approved gauge byte slots redacted in place'

const SURFACE = {
  surface: 'preview-strip',
  viewport: { width: 1440, height: 1000 },
  showId: 'oracle-fresh-capture',
  captureSettings: 'element-clip;deviceScaleFactor=1;animations=disabled',
  domFingerprint: FINGERPRINT,
  fingerprintPolicy: POLICY,
} as const

const DELIVERED_V2 = { storageVersion: 'v2', authoredState: 'fixedTimeMs=0;prepare=none', numericPhase: 'delivered' } as const
const DELIVERED_V1 = { ...DELIVERED_V2, storageVersion: 'v1' } as const

function capture(
  label: string,
  sequence: number,
  rgba: Rgba,
  overrides: Partial<CaptureEvidence> = {},
): CaptureEvidence {
  return {
    label,
    sequence,
    path: `/tmp/pxlblz/${label}.png`,
    // Independently acquired captures of an unchanged surface are expected to be byte-equal, so the
    // digest is deliberately the same everywhere unless a case overrides it.
    sha256: 'a'.repeat(64),
    surface: { ...SURFACE },
    state: { ...DELIVERED_V2 },
    mutationHistory: 'restore cycle 3',
    samples: [{ ...POSITION, rgba }],
    ...overrides,
  }
}

function chainNode(tag: string) {
  return {
    tag,
    attributes: { class: 'show-strip-sections' },
    rect: { x: 360, y: 250, width: 40, height: 12 },
    computedStyle: { color: 'rgb(161, 161, 170)', 'border-radius': '4px' },
    pseudoStyle: {},
  }
}

const CHANGED: ChangedPixel[] = [{ ...POSITION, left: A, right: B }]

function domStates(canvasBacked = false, tag = 'span') {
  return [{
    fingerprint: FINGERPRINT,
    points: [{ ...POSITION, canvasBacked, chain: [chainNode(tag), chainNode('div')] }],
  }]
}

/** v2's restoration residual: the candidate is captured after a control group in the same state. */
function input(overrides: Partial<RasterNoiseInput> = {}): RasterNoiseInput {
  return {
    comparison: 'v2 delivered vs restored',
    plan: { controlGroups: ['v2-restored'] },
    candidate: {
      left: capture('raw-candidate', 7, A, { mutationHistory: 'none, after control collection' }),
      right: capture('restored-candidate', 10, B),
    },
    controlGroups: [{
      label: 'v2-restored',
      state: { ...DELIVERED_V2 },
      captures: [
        capture('restored-control-a', 5, A, { mutationHistory: 'restore cycle 1' }),
        capture('restored-control-b', 6, B, { mutationHistory: 'restore cycle 2' }),
      ],
    }],
    changedPixels: CHANGED,
    reportedChangedPixels: 1,
    domStates: domStates(),
    ...overrides,
  }
}

/** The cross-version raw comparison, where pooling two stable versions would be fatal. */
function crossVersion(groups: readonly ControlGroup[]): RasterNoiseInput {
  return {
    comparison: 'v1 vs v2 delivered',
    plan: { controlGroups: groups.map(group => group.label) },
    candidate: {
      left: capture('v1-raw-candidate', 7, A, { state: { ...DELIVERED_V1 } }),
      right: capture('v2-raw-candidate', 8, B),
    },
    controlGroups: groups,
    changedPixels: CHANGED,
    reportedChangedPixels: 1,
    domStates: domStates(),
  }
}

function group(label: string, state: RenderState, first: Rgba, second: Rgba, from: number): ControlGroup {
  return {
    label,
    state: { ...state },
    captures: [
      capture(`${label}-a`, from, first, { state: { ...state } }),
      capture(`${label}-b`, from + 1, second, { state: { ...state } }),
    ],
  }
}

describe('both values must be observed inside one unchanged control group', () => {
  it('classifies when one group observed both of the candidate values at that position', () => {
    const result = classifyRasterNoise(input())
    expect(result.classified).toBe(true)
    expect(result.reason).toBe('classified')
    expect(result.residualPixels).toEqual([])
    expect(result.classifiedPixels[0].qualifyingGroup).toBe('v2-restored')
    expect(result.classifiedPixels[0].qualifiedBy).toEqual(['restored-control-a', 'restored-control-b'])
  })

  it('refuses to pool a stable v1 group with a stable v2 group, which would excuse a version regression', () => {
    const pooled = classifyRasterNoise(crossVersion([
      group('v1-delivered', DELIVERED_V1, A, A, 3),
      group('v2-delivered', DELIVERED_V2, B, B, 5),
    ]))
    expect(pooled.classified).toBe(false)
    expect(pooled.residualPixels[0].reason).toBe('variant-not-observed')
    expect(pooled.residualPixels[0].qualifyingGroup).toBeNull()
  })

  it('classifies the same cross-version pixel once one version is shown to vary on its own', () => {
    const varying = classifyRasterNoise(crossVersion([
      group('v1-delivered', DELIVERED_V1, A, B, 3),
      group('v2-delivered', DELIVERED_V2, B, B, 5),
    ]))
    expect(varying.classified).toBe(true)
    expect(varying.classifiedPixels[0].qualifyingGroup).toBe('v1-delivered')
  })

  it('ignores a group whose storage version is neither side of the candidate', () => {
    const foreign = classifyRasterNoise(crossVersion([
      group('v3-delivered', { ...DELIVERED_V1, storageVersion: 'v3' }, A, B, 3),
    ]))
    expect(foreign.classified).toBe(false)
    expect(foreign.reason).toBe('state-differs')
  })

  it('ignores a group in another authored state or numeric phase', () => {
    for (const state of [
      { ...DELIVERED_V2, authoredState: 'fixedTimeMs=1200;prepare=none' },
      { ...DELIVERED_V2, numericPhase: 'normalized' },
    ]) {
      const result = classifyRasterNoise(input({
        plan: { controlGroups: ['other-state'] },
        controlGroups: [group('other-state', state, A, B, 5)],
      }))
      expect(result.reason).toBe('state-differs')
      expect(result.classified).toBe(false)
    }
  })

  it('reports nothing to classify when the comparison found no changed pixel', () => {
    const result = classifyRasterNoise(input({ changedPixels: [], reportedChangedPixels: 0 }))
    expect(result.classified).toBe(false)
    expect(result.reason).toBe('nothing-to-classify')
  })
})

describe('independence is capture identity, not image bytes', () => {
  it('accepts two independently acquired controls that produced byte-identical images', () => {
    expect(classifyRasterNoise(input()).classified).toBe(true)
  })

  it('refuses a control that is one of the candidate capture events', () => {
    for (const reused of [
      { label: 'raw-candidate' },
      { path: '/tmp/pxlblz/raw-candidate.png' },
      { sequence: 7 },
    ]) {
      const result = classifyRasterNoise(input({
        controlGroups: [{
          label: 'v2-restored',
          state: { ...DELIVERED_V2 },
          captures: [capture('restored-control-a', 5, A, reused), capture('restored-control-b', 6, B)],
        }],
      }))
      expect(result.reason).toBe('control-reuses-candidate-capture')
      expect(result.classified).toBe(false)
    }
  })
})

describe('controls are collected before the candidate, under a closed plan', () => {
  it('refuses a control captured after the candidate', () => {
    const late = classifyRasterNoise(input({
      controlGroups: [{
        label: 'v2-restored',
        state: { ...DELIVERED_V2 },
        captures: [capture('restored-control-a', 5, A), capture('late-control', 11, B)],
      }],
    }))
    expect(late.reason).toBe('control-after-candidate')
  })

  it('refuses a candidate captured before the controls, with no exemption available', () => {
    const original = classifyRasterNoise(input({
      candidate: {
        left: capture('v1a-original', 1, A, { state: { ...DELIVERED_V1 } }),
        right: capture('v2a-original', 2, B),
      },
    }))
    expect(original.reason).toBe('control-after-candidate')
    expect(original.classified).toBe(false)
  })

  it('refuses a missing planned group and an extra unplanned one alike', () => {
    expect(classifyRasterNoise(input({ controlGroups: [] })).reason).toBe('control-plan-mismatch')
    const extra = classifyRasterNoise(input({
      controlGroups: [
        ...input().controlGroups,
        group('improvised', DELIVERED_V2, A, B, 2),
      ],
    }))
    expect(extra.reason).toBe('control-plan-mismatch')
  })

  it('refuses a control group that observed the state only once', () => {
    const single = classifyRasterNoise(input({
      controlGroups: [{ label: 'v2-restored', state: { ...DELIVERED_V2 }, captures: [capture('restored-control-a', 5, A)] }],
    }))
    expect(single.reason).toBe('incomplete-evidence')
  })

  it('refuses a group whose captures are not all in the state the group claims', () => {
    const mixed = classifyRasterNoise(input({
      controlGroups: [{
        label: 'v2-restored',
        state: { ...DELIVERED_V2 },
        captures: [capture('restored-control-a', 5, A), capture('restored-control-b', 6, B, { state: { ...DELIVERED_V1 } })],
      }],
    }))
    expect(mixed.reason).toBe('state-differs')
  })
})

describe('missing or partial evidence fails closed', () => {
  it('refuses a capture with no retained path or digest', () => {
    for (const missing of [{ path: '' }, { sha256: '' }, { sha256: 'short' }, { mutationHistory: '' }]) {
      const result = classifyRasterNoise(input({
        candidate: { left: capture('raw-candidate', 7, A, missing), right: capture('restored-candidate', 10, B) },
      }))
      expect(result.reason).toBe('incomplete-evidence')
    }
  })

  it('refuses when no chain evidence covers the changed position', () => {
    const empty = classifyRasterNoise(input({ domStates: [{ fingerprint: FINGERPRINT, points: [] }] }))
    expect(empty.residualPixels[0].reason).toBe('no-chain-evidence')
    const otherState = classifyRasterNoise(input({ domStates: [{ fingerprint: 'sha256:elsewhere', points: domStates()[0].points }] }))
    expect(otherState.residualPixels[0].reason).toBe('no-chain-evidence')
  })

  it('refuses when the supplied list is shorter than the comparison reported', () => {
    expect(classifyRasterNoise(input({ reportedChangedPixels: 8 })).reason).toBe('hidden-drift')
  })

  it('refuses the whole comparison when a single pixel stays unexplained', () => {
    const result = classifyRasterNoise(input({
      changedPixels: [...CHANGED, { x: 999, y: 999, left: A, right: B }],
      reportedChangedPixels: 2,
    }))
    expect(result.classified).toBe(false)
    expect(result.reason).toBe('pixel-not-classified')
    expect(result.classifiedPixels).toHaveLength(1)
    expect(result.residualPixels).toHaveLength(1)
  })

  it('names the retained evidence it rests on', () => {
    const result = classifyRasterNoise(input())
    expect(result.evidence.map(item => item.label).sort())
      .toEqual(['raw-candidate', 'restored-candidate', 'restored-control-a', 'restored-control-b'])
    expect(result.evidence.every(item => item.path && item.sha256)).toBe(true)
  })
})

describe('the surface state must be identical everywhere', () => {
  const differences = {
    surface: { surface: 'whole-editor' },
    viewport: { viewport: { width: 390, height: 844 } },
    'Show identity': { showId: 'a-different-show' },
    'capture settings': { captureSettings: 'element-clip;deviceScaleFactor=2;animations=disabled' },
    geometry: { domFingerprint: 'sha256:some-other-dom' },
    'fingerprint policy': { fingerprintPolicy: 'whatever the caller felt like hashing' },
  }

  for (const [name, patch] of Object.entries(differences)) {
    it(`refuses a control whose ${name} differs`, () => {
      const result = classifyRasterNoise(input({
        controlGroups: [{
          label: 'v2-restored',
          state: { ...DELIVERED_V2 },
          captures: [
            capture('restored-control-a', 5, A, { surface: { ...SURFACE, ...patch } }),
            capture('restored-control-b', 6, B, { surface: { ...SURFACE, ...patch } }),
          ],
        }],
      }))
      expect(result.reason).toBe('state-differs')
    })
  }

  it('refuses when the two candidate captures are not themselves one surface state', () => {
    const moved = classifyRasterNoise(input({
      candidate: {
        left: capture('raw-candidate', 7, A),
        right: capture('restored-candidate', 10, B, { surface: { ...SURFACE, domFingerprint: 'sha256:moved' } }),
      },
    }))
    expect(moved.reason).toBe('state-differs')
  })

  it('refuses when the candidate sides are in different authored states or phases', () => {
    const drifted = classifyRasterNoise(input({
      candidate: {
        left: capture('raw-candidate', 7, A),
        right: capture('restored-candidate', 10, B, { state: { ...DELIVERED_V2, numericPhase: 'normalized' } }),
      },
    }))
    expect(drifted.reason).toBe('state-differs')
  })
})

describe('the qualifying observation must be exact', () => {
  it('refuses a group that observed the position but never both candidate values', () => {
    for (const [first, second] of [[A, C], [A, A], [C, C]] as const) {
      const result = classifyRasterNoise(input({
        controlGroups: [group('v2-restored', DELIVERED_V2, first, second, 5)],
      }))
      expect(result.residualPixels[0].reason).toBe('variant-not-observed')
    }
  })

  it('refuses an observation at a neighbouring position', () => {
    const shifted = (label: string, sequence: number, rgba: Rgba) =>
      capture(label, sequence, rgba, { samples: [{ x: POSITION.x + 1, y: POSITION.y, rgba }] })
    const result = classifyRasterNoise(input({
      controlGroups: [{
        label: 'v2-restored',
        state: { ...DELIVERED_V2 },
        captures: [shifted('restored-control-a', 5, A), shifted('restored-control-b', 6, B)],
      }],
    }))
    expect(result.residualPixels[0].reason).toBe('control-missing-position')
  })

  it('refuses when one capture of the group never sampled the position', () => {
    const result = classifyRasterNoise(input({
      controlGroups: [{
        label: 'v2-restored',
        state: { ...DELIVERED_V2 },
        captures: [capture('restored-control-a', 5, A), capture('restored-control-b', 6, B, { samples: [] })],
      }],
    }))
    expect(result.residualPixels[0].reason).toBe('control-missing-position')
  })

  it('refuses when the candidate images disagree with the difference it was handed', () => {
    const result = classifyRasterNoise(input({
      candidate: { left: capture('raw-candidate', 7, C), right: capture('restored-candidate', 10, B) },
    }))
    expect(result.residualPixels[0].reason).toBe('candidate-bytes-disagree')
  })

  it('refuses a constant one-channel regression no control ever reproduced', () => {
    const result = classifyRasterNoise(input({
      changedPixels: [{ x: 12, y: 40, left: A, right: B }],
      reportedChangedPixels: 1,
    }))
    expect(result.classified).toBe(false)
    expect(result.residualPixels[0].reason).toBe('no-chain-evidence')
  })
})

describe('canvas pixels are not exempted by DOM identity', () => {
  it('classifies a canvas-backed pixel only through the same observed-variant rule', () => {
    const canvas = { domStates: domStates(true, 'canvas') }
    expect(classifyRasterNoise(input(canvas)).classifiedPixels[0].canvasBacked).toBe(true)
    const uncovered = classifyRasterNoise(input({
      ...canvas,
      controlGroups: [group('v2-restored', DELIVERED_V2, A, A, 5)],
    }))
    expect(uncovered.residualPixels[0].reason).toBe('variant-not-observed')
  })

  it('refuses chain evidence that hides a canvas behind a false flag', () => {
    const result = classifyRasterNoise(input({ domStates: domStates(false, 'canvas') }))
    expect(result.residualPixels[0].reason).toBe('no-chain-evidence')
  })
})

describe('the surface fingerprint replaces only the verified value, in its own fixed field', () => {
  const TRACK = 'gauge/track'
  const FILL = 'gauge/fill'
  const READOUT = 'gauge/readout'

  /** The gauge's fixed slots, carrying the value the delivered artifact was verified to hold. */
  function fields(token: string, width: string, readoutPath = READOUT) {
    return [
      { path: TRACK, field: { kind: 'attribute', name: 'aria-label' }, value: token },
      { path: FILL, field: { kind: 'attribute', name: 'style' }, value: width },
      { path: readoutPath, field: { kind: 'text-node', index: 0 }, value: token },
    ] as const
  }

  function surface(options: {
    token?: string
    width?: string
    label?: string
    siblingText?: string
    siblingStyle?: string
    readoutPath?: string
  } = {}): SurfaceNodeEvidence[] {
    const {
      token = '7.0 KB', width = '10.5376%', label = 'Show source', siblingText = 'up to 3 copies',
      siblingStyle = '8px', readoutPath = READOUT,
    } = options
    return [
      {
        path: TRACK,
        tag: 'span',
        attributes: { class: 'show-source-thermometer', 'aria-label': `${label} ${token} / 66.8 KB advisory.` },
        textNodes: [],
        rect: { x: 248, y: 451, width: 112, height: 8 },
        computedStyle: { width: '112px' },
        pseudoStyle: {},
      },
      {
        path: FILL,
        tag: 'span',
        attributes: { class: 'bg-live', style: `width: ${width}` },
        textNodes: [],
        rect: { x: 248, y: 451, width: 11.8, height: 8 },
        computedStyle: { width: '11.8px' },
        pseudoStyle: {},
      },
      {
        path: readoutPath,
        tag: 'span',
        attributes: {},
        textNodes: [token, ' / ', '66.8 KB'],
        rect: { x: 364, y: 451, width: 84, height: 12 },
        computedStyle: { color: 'rgb(161, 161, 170)' },
        pseudoStyle: {},
      },
      {
        path: 'strip/copies',
        tag: 'span',
        attributes: {},
        textNodes: [siblingText],
        rect: { x: 500, y: 451, width: 90, height: 12 },
        computedStyle: { 'letter-spacing': siblingStyle },
        pseudoStyle: {},
      },
    ]
  }

  const V1 = () => surfaceStateFingerprint(surface(), fields('7.0 KB', '10.5376%'))

  it('matches two surfaces that differ only by the verified value in the fixed fields', () => {
    expect(V1()).toBe(surfaceStateFingerprint(
      surface({ token: '7.2 KB', width: '10.8418%' }), fields('7.2 KB', '10.8418%')))
  })

  it('still separates a duplicate same-looking number in unrelated text', () => {
    expect(V1()).not.toBe(surfaceStateFingerprint(
      surface({ siblingText: 'up to 7.0 KB copies' }), fields('7.0 KB', '10.5376%')))
  })

  it('still separates a same-looking number that appears in an unrelated style', () => {
    expect(V1()).not.toBe(surfaceStateFingerprint(
      surface({ siblingStyle: '10.5376%' }), fields('7.0 KB', '10.5376%')))
  })

  it('separates a change elsewhere inside the very field the value sits in', () => {
    expect(V1()).not.toBe(surfaceStateFingerprint(
      surface({ label: 'Controller source' }), fields('7.0 KB', '10.5376%')))
  })

  it('separates a surface whose gauge readout moved to another node', () => {
    expect(V1()).not.toBe(surfaceStateFingerprint(
      surface({ readoutPath: 'gauge/readout-moved' }), fields('7.0 KB', '10.5376%', 'gauge/readout-moved')))
  })

  it('refuses a field the surface does not carry, or a value that is not uniquely in it', () => {
    expect(() => surfaceStateFingerprint(surface(), [
      { path: 'gauge/missing', field: { kind: 'text-node', index: 0 }, value: '7.0 KB' },
    ])).toThrow(/gauge\/missing/)
    expect(() => surfaceStateFingerprint(surface(), [
      { path: READOUT, field: { kind: 'text-node', index: 9 }, value: '7.0 KB' },
    ])).toThrow(/text node 9/)
    expect(() => surfaceStateFingerprint(surface(), [
      { path: FILL, field: { kind: 'attribute', name: 'title' }, value: '7.0 KB' },
    ])).toThrow(/title/)
    expect(() => surfaceStateFingerprint(surface(), [
      { path: TRACK, field: { kind: 'attribute', name: 'aria-label' }, value: '9.9 KB' },
    ])).toThrow(/exactly once/)
    expect(() => surfaceStateFingerprint(surface({ token: '66.8 KB' }), [
      { path: READOUT, field: { kind: 'text-node', index: 2 }, value: '66.8 KB' },
      { path: TRACK, field: { kind: 'attribute', name: 'aria-label' }, value: '66.8 KB' },
    ])).toThrow(/exactly once/)
  })
})
