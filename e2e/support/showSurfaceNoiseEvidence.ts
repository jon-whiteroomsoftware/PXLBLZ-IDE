import type { Page } from '@playwright/test'
import type { PixelSample } from '../../src/test/showCapturePixelEvidence'
import type { DomStateEvidence } from '../../src/test/showCaptureRasterNoiseClassifier'
import type { GaugeElementEvidence, PixelBox } from '../../src/test/showSourceGaugeExceptionOracle'
import type { FixedValueField } from '../../src/test/showSurfaceStateSerialization'

/**
 * The canonical run's page-side collectors for #1065 capture-noise classification.
 *
 * This module drives and reads the page. It owns no lifecycle: seeding, staging, opening at the
 * fixed state, preparing a surface and taking a screenshot all stay in
 * `show-editor-equivalence.auth.spec.ts`, which calls these between its own steps. All of the
 * decision logic lives in the pure modules under `src/test/`, which have their own tests; nothing
 * here decides whether anything qualifies.
 *
 * The gauge roles and the fields that may carry its value are fixed here. There is no selector
 * option, no caller-supplied redaction list and no way to widen the set from a spec.
 */

/** The portal gauge the Show editor renders into the preview strip. */
const GAUGE_TRACK_SELECTOR = '.show-source-thermometer'

export interface SurfaceStateReading {
  /** The surface-state fingerprint, hashed in the page over the shared serialization rule. */
  fingerprint: string
  nodeCount: number
  gauge: GaugeReading
}

export type GaugeReading =
  | { present: false; reason: string }
  | {
    present: true
    /**
     * Where the gauge stood relative to the captured surface. `inside` is the gauge drawn in the
     * surface's own subtree; `behind` is the gauge outside that subtree but under the surface box,
     * which a translucent or backdrop-filtered surface still carries into its capture (#1065, Jon
     * 2026-09-18).
     */
    placement: 'inside' | 'behind'
    /**
     * Whether the gauge can reach this capture at all: wholly inside the surface box when it is in
     * the surface, and overlapping it when it is behind. False when the gauge is in the DOM but
     * cannot paint into the capture.
     */
    reachesSurface: boolean
    surfaceBox: PixelBox
    trackBox: PixelBox
    token: string
    budgetToken: string
    inlineWidth: string
    fields: readonly FixedValueField[]
    elements: readonly GaugeElementEvidence[]
  }

/**
 * Reads one surface state: the fingerprint over its whole structure, and whatever the fixed gauge
 * roles hold. The value replaced in the fingerprint is the one the fixed slot displays; that it is
 * the artifact's truth is proved separately by `qualifySourceSizeException`, and without that proof
 * nothing qualifies, so the ordering cannot licence a false value.
 */
export async function readSurfaceState(
  page: Page,
  selector: string | undefined,
  /**
   * That version's delivered token, as its own label carries it. The label is verified and never
   * mutated, so in a normalized state it still holds the delivered value while the readout and fill
   * hold the common one, and each field must be replaced with the value that field actually has.
   * Omitted on the first, unmutated read, where the readout is the delivered value.
   */
  deliveredToken?: string,
): Promise<SurfaceStateReading> {
  return page.evaluate(async ({ surfaceSelector, trackSelector, labelToken }) => {
    const root = surfaceSelector ? document.querySelector(surfaceSelector) : document.body
    if (!root) throw new Error(`The surface ${surfaceSelector ?? 'document.body'} is not present.`)

    const describeStyles = (element: Element) => {
      const computed = getComputedStyle(element)
      const computedStyle: Record<string, string> = {}
      for (const property of computed) computedStyle[property] = computed.getPropertyValue(property)
      const pseudoStyle: Record<string, Record<string, string>> = {}
      for (const pseudoSelector of ['::before', '::after']) {
        const pseudo = getComputedStyle(element, pseudoSelector)
        if (pseudo.content === 'none' || pseudo.content === '') continue
        const collected: Record<string, string> = {}
        for (const property of pseudo) collected[property] = pseudo.getPropertyValue(property)
        pseudoStyle[pseudoSelector] = collected
      }
      return { computedStyle, pseudoStyle }
    }

    const nodes: unknown[] = []
    const paths = new Map<Element, string>()
    const walk = (element: Element, path: string) => {
      const box = element.getBoundingClientRect()
      paths.set(element, path)
      nodes.push({
        path,
        tag: element.tagName.toLowerCase(),
        attributes: Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value])),
        textNodes: [...element.childNodes]
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.nodeValue ?? ''),
        rect: { x: box.x, y: box.y, width: box.width, height: box.height },
        ...describeStyles(element),
      })
      ;[...element.children].forEach((child, index) => walk(child, `${path}/${index}`))
    }
    walk(root, 'surface')

    const describeRole = (element: Element, role: string): GaugeElementEvidence => {
      const box = element.getBoundingClientRect()
      return {
        role,
        tag: element.tagName.toLowerCase(),
        classList: element.getAttribute('class') ?? '',
        attributes: Object.fromEntries([...element.attributes]
          .filter(attribute => attribute.name !== 'class')
          .map(attribute => [attribute.name, attribute.value])),
        textNodes: [...element.childNodes]
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.nodeValue ?? ''),
        childNodeCount: element.childNodes.length,
        rect: { x: box.x, y: box.y, width: box.width, height: box.height },
        ...describeStyles(element),
      } as GaugeElementEvidence
    }

    let gauge: GaugeReading = { present: false, reason: 'gauge-absent' }
    // The gauge is either drawn in this surface or lying under it. A surface that is translucent or
    // backdrop-filtered carries what is behind it into its own capture, so the gauge outside the
    // subtree is still the thing a difference inside the capture can come from (#1065).
    const inSurface = root.querySelector(trackSelector)
    const track = inSurface ?? document.querySelector(trackSelector)
    const placement: 'inside' | 'behind' = inSurface ? 'inside' : 'behind'
    const fill = track?.firstElementChild ?? null
    const readout = track?.nextElementSibling ?? null
    if (track && fill && readout) {
      const tokens = [...readout.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.nodeValue ?? '')
      const surfaceBox = root.getBoundingClientRect()
      const trackBox = track.getBoundingClientRect()
      const readoutBox = readout.getBoundingClientRect()
      const contains = (box: DOMRect) => box.left >= surfaceBox.left - 0.5 && box.top >= surfaceBox.top - 0.5
        && box.right <= surfaceBox.right + 0.5 && box.bottom <= surfaceBox.bottom + 0.5
      // Positive-area overlap: a gauge that only touches the surface edge paints nothing into it.
      const overlaps = (box: DOMRect) => box.width > 0 && box.height > 0
        && surfaceBox.width > 0 && surfaceBox.height > 0
        && box.left < surfaceBox.right && surfaceBox.left < box.right
        && box.top < surfaceBox.bottom && surfaceBox.top < box.bottom
      const asBox = (box: DOMRect) => ({ x: box.x, y: box.y, width: box.width, height: box.height })
      const inlineWidth = (fill as HTMLElement).style.width
      // The readout is the editor's fixed three-node shape: numerator, separator, denominator.
      if (tokens.length !== 3 || tokens[1] !== ' / ' || !inlineWidth) {
        gauge = { present: false, reason: 'gauge-readout-shape-unrecognized' }
      } else {
        const labelValue = labelToken ?? tokens[0]
        // A gauge behind the surface has no node in it, so there is no value field to replace and
        // the surface's fingerprint carries no gauge value at all - which is exactly the truth.
        const fields: FixedValueField[] = placement === 'behind' ? [] : [
          { path: paths.get(track)!, field: { kind: 'attribute', name: 'aria-label' }, value: labelValue },
          { path: paths.get(fill)!, field: { kind: 'attribute', name: 'style' }, value: inlineWidth },
          { path: paths.get(readout)!, field: { kind: 'text-node', index: 0 }, value: tokens[0] },
        ]
        if (placement === 'inside' && track.getAttribute('title') !== null) {
          fields.push({ path: paths.get(track)!, field: { kind: 'attribute', name: 'title' }, value: labelValue })
        }
        gauge = {
          present: true,
          placement,
          reachesSurface: placement === 'inside'
            ? contains(trackBox) && contains(readoutBox)
            : overlaps(trackBox),
          surfaceBox: asBox(surfaceBox),
          trackBox: asBox(trackBox),
          token: tokens[0],
          budgetToken: tokens[2],
          inlineWidth,
          fields,
          elements: [describeRole(track, 'track'), describeRole(fill, 'fill'), describeRole(readout, 'readout')],
        }
      }
    }

    const load = (path: string) => import(path)
    const { serializeSurfaceState } = await load('/PXLBLZ-IDE/src/test/showSurfaceStateSerialization.ts')
    let serialized: string
    try {
      serialized = serializeSurfaceState(nodes, gauge.present ? gauge.fields : [])
    } catch (cause) {
      // An approved value that is not uniquely in its own field cannot be replaced without guessing,
      // so the gauge is reported unusable and the surface keeps its strict verdict.
      gauge = { present: false, reason: `gauge-value-not-uniquely-placed: ${(cause as Error).message}` }
      serialized = serializeSurfaceState(nodes, [])
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))
    const fingerprint = `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
    return { fingerprint, nodeCount: nodes.length, gauge }
  }, {
    surfaceSelector: selector,
    trackSelector: GAUGE_TRACK_SELECTOR,
    labelToken: deliveredToken,
  }) as Promise<SurfaceStateReading>
}

/**
 * Writes the common value into the two mutable gauge slots: the one visible numerator text node and
 * the fill's inline width. `aria-label` and `title` are verified and deliberately never mutated, so
 * a value-dependent attribute selector cannot be normalized away.
 */
export async function applyCommonGaugeValues(page: Page, token: string, inlineWidth: string): Promise<void> {
  const applied = await page.evaluate(async ({ nextToken, nextWidth, trackSelector }) => {
    type Holder = { node: Text; fill: HTMLElement; original: { token: string; width: string } }
    const scope = window as unknown as { __pxlblzGaugeSlots?: Holder }
    let holder = scope.__pxlblzGaugeSlots
    if (!holder) {
      const track = document.querySelector(trackSelector)
      const fill = track?.firstElementChild as HTMLElement | null
      const readout = track?.nextElementSibling
      if (!track || !fill || !readout) return false
      const load = (path: string) => import(path)
      const { selectReadoutNumeratorNode } = await load('/PXLBLZ-IDE/src/test/showSourceGaugeExceptionOracle.ts')
      const node = selectReadoutNumeratorNode(readout) as Text
      holder = { node, fill, original: { token: node.nodeValue ?? '', width: fill.style.width } }
      scope.__pxlblzGaugeSlots = holder
    }
    holder.node.nodeValue = nextToken
    holder.fill.style.width = nextWidth
    return true
  }, { nextToken: token, nextWidth: inlineWidth, trackSelector: GAUGE_TRACK_SELECTOR })
  if (!applied) throw new Error('The gauge slots could not be normalized; its fixed shape was not found.')
  await presentFrame(page)
}

/** Puts the two mutated slots back to the values the page itself authored. */
export async function restoreGaugeValues(page: Page): Promise<boolean> {
  const restored = await page.evaluate(() => {
    const scope = window as unknown as {
      __pxlblzGaugeSlots?: { node: Text; fill: HTMLElement; original: { token: string; width: string } }
    }
    const holder = scope.__pxlblzGaugeSlots
    if (!holder) return false
    holder.node.nodeValue = holder.original.token
    holder.fill.style.width = holder.original.width
    delete scope.__pxlblzGaugeSlots
    return true
  })
  await presentFrame(page)
  return restored
}

/** Waits for a presented frame, so a capture never races the write that preceded it. */
export async function presentFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

export interface CapturedPixelDifference {
  comparable: boolean
  changedPixels: number
  maximumChannelDelta: number
  pixels: { x: number; y: number; left: [number, number, number, number]; right: [number, number, number, number] }[]
}

/** Decodes the two retained images in the page and reads their exact difference out of the pixels. */
export async function differenceBetweenCaptures(
  page: Page,
  left: Buffer,
  right: Buffer,
): Promise<CapturedPixelDifference> {
  return page.evaluate(async ({ leftBase64, rightBase64 }) => {
    const decode = async (base64: string) => {
      const binary = atob(base64)
      const bytes = Uint8Array.from(binary, value => value.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      return {
        width: bitmap.width,
        height: bitmap.height,
        pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
      }
    }
    const [a, b] = await Promise.all([decode(leftBase64), decode(rightBase64)])
    if (a.width !== b.width || a.height !== b.height) {
      return { comparable: false, changedPixels: 0, maximumChannelDelta: 0, pixels: [] }
    }
    const load = (path: string) => import(path)
    const { changedPixelsBetween } = await load('/PXLBLZ-IDE/src/test/showCapturePixelEvidence.ts')
    const { compareRgbaPixels } = await load('/PXLBLZ-IDE/src/test/showEditorEquivalenceOracle.ts')
    const summary = compareRgbaPixels(a.pixels, b.pixels)
    return { comparable: true, ...summary, pixels: changedPixelsBetween(a, b) }
  }, { leftBase64: left.toString('base64'), rightBase64: right.toString('base64') }) as Promise<CapturedPixelDifference>
}

/** What one retained capture holds at each implicated position, read back from its own bytes. */
export async function sampleCapture(
  page: Page,
  bytes: Buffer,
  positions: readonly { x: number; y: number }[],
): Promise<PixelSample[]> {
  if (positions.length === 0) return []
  return page.evaluate(async ({ base64, wanted }) => {
    const binary = atob(base64)
    const raw = Uint8Array.from(binary, value => value.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([raw], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const image = {
      width: bitmap.width,
      height: bitmap.height,
      pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
    }
    const load = (path: string) => import(path)
    const { samplesAt } = await load('/PXLBLZ-IDE/src/test/showCapturePixelEvidence.ts')
    return samplesAt(image, wanted)
  }, { base64: bytes.toString('base64'), wanted: [...positions] }) as Promise<PixelSample[]>
}

/**
 * The element under each implicated position and its ancestors to the surface root, recorded
 * verbatim. `elementFromPoint` names the topmost hit element only, which is why the whole chain and
 * its pseudo styles are kept: a matching chain does not prove matching paint, it places the
 * difference below the DOM. Whether a canvas paints the position is recorded, never assumed.
 */
export async function collectPointChains(
  page: Page,
  selector: string | undefined,
  fingerprint: string,
  positions: readonly { x: number; y: number }[],
): Promise<DomStateEvidence> {
  if (positions.length === 0) return { fingerprint, points: [] }
  const points = await page.evaluate(({ surfaceSelector, wanted }) => {
    const root = surfaceSelector ? document.querySelector(surfaceSelector) : document.body
    if (!root) throw new Error(`The surface ${surfaceSelector ?? 'document.body'} is not present.`)
    const box = root.getBoundingClientRect()
    const describe = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      const computedStyle: Record<string, string> = {}
      for (const property of computed) computedStyle[property] = computed.getPropertyValue(property)
      const pseudoStyle: Record<string, Record<string, string>> = {}
      for (const pseudoSelector of ['::before', '::after']) {
        const pseudo = getComputedStyle(element, pseudoSelector)
        if (pseudo.content === 'none' || pseudo.content === '') continue
        const collected: Record<string, string> = {}
        for (const property of pseudo) collected[property] = pseudo.getPropertyValue(property)
        pseudoStyle[pseudoSelector] = collected
      }
      return {
        tag: element.tagName.toLowerCase(),
        attributes: Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value])),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        computedStyle,
        pseudoStyle,
      }
    }
    return wanted.map(({ x, y }) => {
      // An image pixel is a CSS pixel offset from the surface box at device scale factor 1, which
      // the desktop project pins; the centre of the pixel is sampled.
      const hit = document.elementFromPoint(box.left + x + 0.5, box.top + y + 0.5)
      const chain: ReturnType<typeof describe>[] = []
      let element: Element | null = hit
      while (element) {
        chain.push(describe(element))
        if (element === root) break
        element = element.parentElement
      }
      return { x, y, canvasBacked: chain.some(node => node.tag === 'canvas'), chain }
    })
  }, { surfaceSelector: selector, wanted: [...positions] })
  return { fingerprint, points } as DomStateEvidence
}


export interface RebuiltArtifactInputs {
  stageMapId: string | null
  stageMapDimension: number | null
  outputContractKind: string | null
  targetPixelCount: number | null
  activeControllerIp: string | null
}

export interface RebuiltArtifact {
  epeText: string
  sourceBytes: number
  route: string
  inputs: RebuiltArtifactInputs
}

/**
 * Transferred verbatim from the #1065 gauge probe, which ran it against the real editor. The probe
 * itself is scratch and does not ship; this is the shipped copy.
 */
/**
 * Rebuilds the delivered `.epe` in the page from the product's own export owners. This is the
 * nearest available artifact boundary: the header Download command is #1066 and is not exercised.
 */
export async function rebuildDeliveredArtifact(page: Page, showId: string, version: 'v1' | 'v2'): Promise<RebuiltArtifact> {
  const rebuilt = await page.evaluate(async ({ id, recordVersion }) => {
    const load = (path: string) => import(path)
    // Stores must be loaded through the URL the application already resolved. Importing a store by
    // a different specifier yields a second module instance with its own empty state, which would
    // silently rebuild the artifact from nothing.
    const loadStore = async (name: string) => {
      const pattern = new RegExp(`/src/store/${name}\\.ts(?:\\?|$)`)
      const url = performance.getEntriesByType('resource').map(entry => entry.name).filter(entry => pattern.test(entry)).at(-1)
      if (!url) throw new Error(`The page has not loaded ${name}; the probe cannot read its live state.`)
      return load(url)
    }
    const [
      { usePatternStore }, { useLibraryStore }, { useMapStore }, { useControllerProfileStore }, { useShowStore },
    ] = await Promise.all([
      loadStore('patternStore'),
      loadStore('libraryStore'),
      loadStore('mapStore'),
      loadStore('controllerProfileStore'),
      loadStore('showStore'),
    ])
    const userPatterns = usePatternStore.getState().userPatterns
    const userLibraries = useLibraryStore.getState().userLibraries
    const userMaps = useMapStore.getState().userMaps
    const profiles = useControllerProfileStore.getState().profiles

    if (recordVersion === 2) {
      const { captureShowStageEditV2 } = await load('/PXLBLZ-IDE/src/engine/showPreparedStageV2.ts')
      const { resolveShowV2StageMap } = await load('/PXLBLZ-IDE/src/store/showV2StageMap.ts')
      const { buildShowEpeExportV2 } = await load('/PXLBLZ-IDE/src/engine/showEpeExportV2.ts')
      const record = useShowStore.getState().showV2Pilots[id]
      if (!record) throw new Error('The v2 record is not loaded in the Show store.')
      const dependencies = {
        patterns: userPatterns,
        libraries: userLibraries,
        maps: userMaps,
        profiles,
        stageMap: resolveShowV2StageMap(record.stageMapId, userMaps),
      }
      const captured = captureShowStageEditV2(record, dependencies)
      if (captured.prepared.status !== 'ready') {
        throw new Error(`The v2 preparation is ${captured.prepared.status}.`)
      }
      const artifact = captured.prepared.bundle.artifact
      const exported = buildShowEpeExportV2(record, artifact.code, {
        stampedAt: new Date(record.updatedAt),
        userMaps,
        attribution: artifact.attribution,
      })
      if (exported.status !== 'exported') throw new Error(`The v2 export refused: ${exported.message}`)
      return {
        text: exported.text,
        source: exported.source,
        route: 'buildShowEpeExportV2 over captureShowStageEditV2',
        inputs: {
          stageMapId: record.stageMapId ?? null,
          stageMapDimension: dependencies.stageMap?.dim ?? null,
          outputContractKind: record.outputContract?.kind ?? null,
          targetPixelCount: null,
          activeControllerIp: null,
        },
      }
    }

    const { compileShowForArtifact, resolveShowCompilationControllerZones } = await load('/PXLBLZ-IDE/src/engine/showPreviewArtifact.ts')
    const { LIBRARIES } = await load('/PXLBLZ-IDE/src/pixelblaze/libs.ts')
    const { compileLibraries } = await load('/PXLBLZ-IDE/src/engine/libraries.ts')
    const { findProfileForLiveController } = await load('/PXLBLZ-IDE/src/engine/controllerProfilePassRecipe.ts')
    const { buildShowEpeExport } = await load('/PXLBLZ-IDE/src/engine/showEpeExport.ts')
    const { STOCK_MAPS } = await loadStore('mapStore')
    const { useControllerStore } = await loadStore('controllerStore')

    // Mirror the editor's own record precedence rather than a convenience resolver: a stock draft
    // would shadow the row and compile a different record.
    const showState = useShowStore.getState()
    if (showState.stockShowDrafts[id]) {
      throw new Error('A stock draft shadows the capture row; the probe would compile a different record.')
    }
    const show = showState.shows.find((entry: { id: string }) => entry.id === id)
    if (!show) throw new Error('The v1 record is not in the Show store.')

    // The Stage dimension comes from the backing record's saved map, looked up across stock and user
    // maps exactly as the editor does; omitting it is what refused Portable 2D compatibility on the
    // first run. The derivation is shared with `showSourceGaugeRebuildInputs`, which is regression-
    // tested against this fixture and the real compiler without a browser.
    const { resolveV1ArtifactCompilationInputs } = await load('/PXLBLZ-IDE/src/test/showSourceGaugeRebuildInputs.ts')
    const controllerState = useControllerStore.getState()
    const activeController = controllerState.activeIp ? controllerState.controllers[controllerState.activeIp] : undefined
    const inputs = resolveV1ArtifactCompilationInputs({
      show,
      maps: [...STOCK_MAPS, ...userMaps],
      profiles,
      hasActiveController: Boolean(activeController),
      liveControllerProfile: activeController
        ? findProfileForLiveController(profiles, activeController) ?? undefined
        : undefined,
    })
    if (inputs.stageMapId && !inputs.stageMapResolved) {
      throw new Error(`The saved Stage map ${inputs.stageMapId} did not resolve across stock and user maps.`)
    }
    const stageDimension = inputs.stageDimension
    const targetPixelCount = inputs.targetPixelCount
    // This bounded fixture excludes a Controller, so say so rather than silently compiling a
    // different artifact if one is attached.
    if (activeController) {
      throw new Error(`A live Controller (${controllerState.activeIp}) is attached; this bounded probe`
        + ' assumed none, and its profile would change the compiled artifact.')
    }
    if (targetPixelCount !== undefined) {
      throw new Error(`The bounded probe excluded a target pixel count, but one is present (${targetPixelCount}).`)
    }

    const compiled = compileShowForArtifact(
      show, userPatterns, resolveShowCompilationControllerZones(show),
      compileLibraries(LIBRARIES, userLibraries),
      { stageDimension, targetPixelCount },
    )
    if (!compiled.artifact) throw new Error(`The v1 compile produced no artifact: ${compiled.error ?? 'unknown'}`)
    const exported = buildShowEpeExport(show, compiled.artifact.code, {
      stampedAt: new Date(show.updatedAt),
      userMaps,
      attribution: compiled.artifact.attribution,
    })
    return {
      text: exported.text,
      source: exported.source,
      route: 'buildShowEpeExport over compileShowForArtifact',
      inputs: {
        stageMapId: inputs.stageMapId,
        stageMapDimension: stageDimension ?? null,
        outputContractKind: inputs.outputContractKind,
        targetPixelCount: targetPixelCount ?? null,
        activeControllerIp: controllerState.activeIp ?? null,
      },
    }
  }, { id: showId, recordVersion: version === 'v2' ? 2 : 1 })

  return {
    epeText: rebuilt.text,
    sourceBytes: new TextEncoder().encode(rebuilt.source).length,
    route: `${rebuilt.route}, rebuilt in page (the Download command is #1066)`,
    inputs: rebuilt.inputs,
  }
}

/** Round-trips the expected percentage through the same CSSOM the gauge wrote through. */
export async function canonicalizePercent(page: Page, bytes: number, budget: number) {
  return page.evaluate(({ deliveredBytes, budgetBytes }) => {
    const percent = (deliveredBytes / budgetBytes) * 100
    const probe = document.createElement('div')
    probe.style.width = `${percent}%`
    return { percent, serialized: probe.style.width }
  }, { deliveredBytes: bytes, budgetBytes: budget })
}
