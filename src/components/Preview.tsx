import { useEffect, useMemo, useRef, useState } from 'react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useControlStore } from '@/store/controlStore'
import { PreviewDeck } from '@/components/PreviewDeck'
import { usePatternStore } from '@/store/patternStore'
import {
  useMapStore,
  DEFAULT_MAP_ID,
  DEFAULT_SHAPE_PIXEL_COUNT,
  defaultPixelCountForDim,
  resolveMap,
} from '@/store/mapStore'
import { seedActiveSettings } from '@/store/settingsCascade'
import { useCameraStore } from '@/store/cameraStore'
import { createShim, createFxShim, type ShimContext } from '@/engine/shim'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { selectRenderCompatibility } from '@/engine/renderCompatibility'
import { bundle } from '@/engine/bundle'
import { compileLibraries } from '@/engine/libraries'
import { createRenderer } from '@/engine/renderer'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { createVirtualClock } from '@/engine/virtualClock'
import { clampPixelCount, advanceAutoOrbit } from '@/engine/camera'
import { cappedPreviewPixelCount } from '@/engine/previewPixelCount'
import { layoutSource as buildLayoutSource } from '@/store/mapStore'
import { resolveLayout } from '@/engine/layout'
import { resolvePole, type ShapeId } from '@/engine/shapes'
import { OrbitControls } from '@/components/OrbitControls'
import { LIBRARIES } from '@/pixelblaze/libs'
import { useLibraryStore } from '@/store/libraryStore'
import { withControlDescriptions } from '@/pixelblaze/controlDescriptions'
import { snapshotWatchValue } from '@/engine/watchValue'
import { captureEnabled, createPreviewCapture } from '@/dev/previewCapture'
import { runCaptureSequence, type CaptureSequenceOptions } from '@/dev/captureSequence'

// Square 3D viewport size (CSS px): fill the available pane edge-to-edge (the
// smaller of its two sides), so the 3D canvas is exactly as tall as a square 2D
// canvas — no margin, which previously made 3D layouts ~40px shorter than 2D. The
// orbiting model is as large as possible (fidelity over breathing room, #146), and
// the bounding-sphere fit (engine) guarantees it never clips at any angle.
function cube3DCanvasPx(containerWidth: number, containerHeight?: number): number {
  if (containerHeight == null) return Math.max(200, Math.floor(containerWidth))
  return Math.max(1, Math.floor(Math.min(containerWidth, containerHeight)))
}

// Keep the transport and collapsed disclosure stack reachable when a wide
// preview would otherwise let its width-sized canvas consume the full pane.
const PREVIEW_CONTROLS_MIN_HEIGHT_PX = 180

function availableCanvasHeight(paneHeight: number, constrainHeight: boolean): number | undefined {
  if (!constrainHeight) return undefined
  return Math.max(1, Math.floor(paneHeight - PREVIEW_CONTROLS_MIN_HEIGHT_PX))
}

export function Preview({
  showDeck = true,
  pixelCountCap = null,
}: {
  showDeck?: boolean
  pixelCountCap?: number | null
}) {
  const constrainCanvasHeight = showDeck && !captureEnabled()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const canvas3DPxRef = useRef<number | null>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  // Dev-only (`?capture`): snapshots the frame from inside paint(); inert otherwise.
  const captureRef = useRef(createPreviewCapture())
  const isRunning = usePreviewStore((s) => s.isRunning)
  const brightness = usePreviewStore((s) => s.brightness)
  const lightSize = usePreviewStore((s) => s.lightSize)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const editorSource = useEditorStore((s) => s.source)
  const editorFlavor = useEditorStore((s) => s.editorFlavor)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const isEditorReadOnly = useEditorStore((s) => s.isReadOnly)
  const previewSource = useEditorStore((s) => s.previewSource)
  const previewUnavailableReason = useEditorStore((s) => s.previewUnavailableReason)
  const displayDim = useEditorStore((s) => s.displayDim)
  const controlValues = useControlStore((s) => s.controlValues)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const activeSurfaceId = useMapStore((s) => s.activeSurfaceId)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const previewPixelCount = cappedPreviewPixelCount(activePixelCount, pixelCountCap)
  const activeSolidity = useMapStore((s) => s.activeSolidity)
  const activeNormalizeMode = useMapStore((s) => s.activeNormalizeMode)
  const userLibraries = useLibraryStore((s) => s.userLibraries)
  const libraries = useMemo(() => compileLibraries(LIBRARIES, userLibraries), [userLibraries])
  const handleRef = useRef<ReturnType<typeof loadPattern> | null>(null)
  const shimRef = useRef<ShimContext | null>(null)
  // The 2D viewport the renderer fits within: the pane width, the height left
  // after reserving the reachable deck, and the live light size. The layout's
  // extent/aspect come from the active map's `pos`, measured inside the renderer.
  const [viewport, setViewport] = useState<{
    containerWidth: number
    containerHeight?: number
    lightSize: number
  } | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const showsLastWorkingPreview = (
    previewUnavailableReason === null
    && editorFlavor === 'pattern'
    && !isEditorReadOnly
    && activePatternId !== null
    && previewSource !== ''
    && editorSource !== previewSource
    && (compileStatus === 'broken' || editorSource === '')
  )

  // Track the container width so the renderer fits the canvas to the pane. Also
  // directly re-fits the renderer on each observation to avoid waiting for the
  // React re-render cycle, which would lag the canvas behind the container during
  // splitter drags. The canvas aspect comes from the active map's `pos`,
  // resolved inside the renderer; light size scales the drawn sources only.
  useEffect(() => {
    const el = containerRef.current
    const root = rootRef.current
    if (!el || !root) return
    const fitPreview = () => {
      const containerWidth = Math.max(1, el.getBoundingClientRect().width)
      const containerHeight = availableCanvasHeight(
        root.getBoundingClientRect().height,
        constrainCanvasHeight,
      )
      const lightSize = usePreviewStore.getState().lightSize
      const nextViewport = { containerWidth, containerHeight, lightSize }
      setViewport(nextViewport)
      if (rendererRef.current) {
        rendererRef.current.resize2D(nextViewport)
        const canvasPx = cube3DCanvasPx(containerWidth, containerHeight)
        rendererRef.current.resize3D(canvasPx)
        if (useEditorStore.getState().displayDim === 3) canvas3DPxRef.current = canvasPx
        if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
      }
    }
    const ro = new ResizeObserver(fitPreview)
    ro.observe(el)
    ro.observe(root)
    return () => ro.disconnect()
  }, [constrainCanvasHeight])

  // Re-fit when the light size changes without a resize.
  useEffect(() => {
    const el = containerRef.current
    const root = rootRef.current
    if (!el || !root) return
    const { width } = el.getBoundingClientRect()
    setViewport({
      containerWidth: Math.max(1, width),
      containerHeight: availableCanvasHeight(
        root.getBoundingClientRect().height,
        constrainCanvasHeight,
      ),
      lightSize,
    })
  }, [lightSize, constrainCanvasHeight])

  // Rebuild the loop whenever source or the viewport changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !viewport) return
    setRuntimeError(null)
    useEditorStore.getState().setRenderAdaptation(null)

    // Opening a map (editor map mode) must NOT touch the preview — it changes the
    // editor surface only, leaving the running pattern rendering untouched. Map
    // preview is deferred (#153, blocked on #143 eval/bake). Entering map mode
    // changes no preview input (previewSource/activeMapId/…), so this loop isn't
    // even rebuilt; nothing here special-cases map mode.
    if (!previewSource) return

    // Bundle first so the Pattern's native dimensionality (highest render fn) is
    // known before resolving its layout — it drives Recommended/default ordering,
    // never a map filter.
    let bundled: ReturnType<typeof bundle>
    try {
      bundled = bundle(previewSource, libraries)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => setRuntimeError(msg))
      return
    }
    const { code, fxCode, metadata } = bundled
    const nativeDim = nativeDimension(metadata.renderFns)
    useEditorStore.getState().setNativeDim(nativeDim)

    // Resolve the active layout: a 1D Pattern combines mapped/Index `[x]` with a
    // viewport Shape; a 2D Pattern combines a map with an optional Surface. The pure
    // helper corrects a stale persisted selection to the dimension's default, and
    // we reflect any correction back so the "Shape" dropdown stays in sync.
    const { userMaps } = useMapStore.getState()
    // The active map/shape/surface/count already carry any demo recommendation —
    // the settings cascade seeded them on open (seedActiveSettings). Detail views
    // may scale the count preview-only, but resolveLayout still needs no separate
    // recommended* inputs: the seeded selection IS the recommendation when a demo
    // opens, freely overridable thereafter.
    // Resolve the full layout in one engine query (src/engine/layout.ts):
    // selection-correction + map/shape/surface resolution + normalization +
    // positions + solid-eligible normals + the grid readout. Store-coupled
    // lookups are injected so the resolver stays engine-pure and table-tested.
    const layout = resolveLayout(
      {
        selection: { mapId: activeMapId, shapeId: activeShapeId, surfaceId: activeSurfaceId },
        nativeDim,
        source: buildLayoutSource({ userMaps }),
        persistedCount: previewPixelCount,
        normalizeMode: activeNormalizeMode,
        poleCols: useCameraStore.getState().poleCols,
        shapeDefaultCount: DEFAULT_SHAPE_PIXEL_COUNT,
        maxPixelCount: pixelCountCap ?? undefined,
      },
      {
        resolveMap: (mapId) => resolveMap(mapId ?? DEFAULT_MAP_ID, userMaps),
        defaultCountForDim: defaultPixelCountForDim,
      },
    )

    // Reflect any dimension-correction back onto the store so the dropdowns stay
    // in sync with what was actually drawn.
    const { correctedSelection } = layout
    if (correctedSelection.mapId && correctedSelection.mapId !== activeMapId) {
      useMapStore.getState().setActiveMap(correctedSelection.mapId)
    }
    if (correctedSelection.shapeId && correctedSelection.shapeId !== activeShapeId) {
      useMapStore.getState().setActiveShape(correctedSelection.shapeId as ShapeId)
    }
    if (correctedSelection.surfaceId && correctedSelection.surfaceId !== activeSurfaceId) {
      useMapStore.getState().setActiveSurface(correctedSelection.surfaceId)
    }

    const { mapPoints, pixelCount, draw } = layout
    const renderCompatibility = selectRenderCompatibility(layout.mapDim, metadata.renderFns)
    // Split the draw channel back into the prior locals so the renderer wiring
    // below is unchanged: the 3D channel carries positions + (solid-eligible)
    // normals; the 2D channel a single pos list.
    const positions3D = draw.kind === '3d' ? draw.positions : null
    const normals3D = draw.kind === '3d' ? draw.normals : null
    const shapePositions = draw.kind === '2d' ? draw.positions : null

    useEditorStore.getState().setDisplayDim(layout.displayDim)
    useEditorStore.getState().setMapDim(layout.mapDim)
    useEditorStore.getState().setLayoutLabel(layout.layoutLabel)
    useEditorStore.getState().setRenderAdaptation(renderCompatibility.description)
    // A normal array is fed exactly for a solid-eligible embedding (Pole, Cylinder,
    // Sphere shell, Cube shell), so its presence IS the eligibility the deck's
    // solidity slider keys on.
    useEditorStore.getState().setSolidEligible(normals3D !== null)

    const clock = createVirtualClock()
    const shimConfig = {
      mapPoints,
      pixelCount,
      dimensions: layout.mapDim,
      getVirtualTime: () => clock.getTime(),
    }
    // The Precise renderer runs the 16.16 fixed-point emit + shim; the Fast
    // renderer runs the plain float64 emit + shim. The hardware `code` artifact
    // is unaffected.
    const shim = fidelity === 'fast' ? createShim(shimConfig) : createFxShim(shimConfig)
    shimRef.current = shim

    let handle: ReturnType<typeof loadPattern>
    try {
      handle = loadPattern(fidelity === 'fast' ? code : fxCode, metadata, shim.builtins)
      handleRef.current = handle
      useEditorStore.getState().setPatternVars(metadata.patternVars)
      useEditorStore.getState().setControls(withControlDescriptions(activeDemoName, metadata.controls))
      // Seed control UI from the pattern's own initialised vars so swatches and
      // sliders show the real starting values on mount. The vars already ran via
      // the pattern's own initialiser, so we read them rather than invoking the
      // callback (which would overwrite hand-picked defaults).
      //   sliders/toggles: convention `sliderFoo`/`toggleFoo` ↔ `foo` (lowercase
      //     first remaining char).
      //   pickers: metadata.pickerVars lists the vars backing each h/s/v or
      //     r/g/b arg (recovered from the picker function body by the bundler).
      const exports = handle.getExports()
      // Exports are raw int32 in fidelity mode; decode to the float UI domain.
      const decode = (raw: unknown): number | undefined =>
        typeof raw === 'number' ? shim.decodeScalar(raw) : undefined
      const defaults: Record<string, number | [number, number, number]> = {}
      for (const c of metadata.controls) {
        if (c.kind === 'slider' || c.kind === 'toggle') {
          const stem = c.exportName.slice(c.kind.length)
          const varName = stem.charAt(0).toLowerCase() + stem.slice(1)
          const v = decode(exports[varName])
          if (v === undefined) continue
          if (c.kind === 'slider') defaults[c.exportName] = Math.max(0, Math.min(1, v))
          else defaults[c.exportName] = v !== 0 ? 1 : 0
        } else if (c.kind === 'hsvPicker' || c.kind === 'rgbPicker') {
          const vars = c.pickerVars
          if (!vars || vars.length !== 3) continue
          const comps = vars.map((name) => decode(exports[name]))
          if (comps.some((v) => v === undefined)) continue
          defaults[c.exportName] = comps.map((v) => Math.max(0, Math.min(1, v as number))) as [
            number,
            number,
            number,
          ]
        }
      }
      useControlStore.getState().resetControls(defaults)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => setRuntimeError(msg))
      return
    }

    const renderer = createRenderer(canvas, viewport)
    rendererRef.current = renderer
    // 3D layout: hand the orbit renderer the cube's [0,1]³ positions, a square
    // canvas, and a base dot size; seed the camera from the ephemeral store.
    if (positions3D) {
      const px = cube3DCanvasPx(viewport.containerWidth, viewport.containerHeight)
      renderer.set3DPositions(positions3D, { canvasPx: px, normals: normals3D })
      const view = useCameraStore.getState()
      renderer.setCamera(view.camera)
      renderer.setZoom(view.zoom)
      renderer.setSolidity(useMapStore.getState().activeSolidity)
      canvas3DPxRef.current = px
    } else {
      // Every 2D layout — stock plane, ring/cloud, or a 1D shape embedding — draws
      // through the single pos channel; the renderer measures extent + neighbour
      // pitch from these points. An empty array is a valid no-op layout.
      renderer.set2DPositions(shapePositions ?? [], viewport)
      canvas3DPxRef.current = null
    }
    renderer.setDiffusion(usePreviewStore.getState().diffusion)

    // 3D paint wrapper: push the live camera angle before drawing. The angle is
    // advanced by an independent rAF (the auto-orbit effect below) so the viewport
    // spin is decoupled from the pattern's play/pause. Read via getState so it
    // never churns React.
    const paint = (pixels: [number, number, number][], brightness: number, dimmed: boolean) => {
      if (positions3D) {
        const view = useCameraStore.getState()
        renderer.setCamera(view.camera)
        renderer.setZoom(view.zoom)
      }
      renderer.paint(pixels, brightness, dimmed)
      // Dev capture: fulfil any pending request with the frame just drawn.
      captureRef.current.afterPaint(canvasRef.current)
    }

    const loop = createRenderLoop({
      handle, shim, clock,
      mapPoints, pixelCount,
      renderCompatibility,
      getSpeed: () => usePreviewStore.getState().speed,
      getBrightness: () => usePreviewStore.getState().brightness,
      isDimmed: () => !usePreviewStore.getState().isRunning,
      paint,
      onError: (err) => setRuntimeError(err.message),
      onFps: (fps) => usePreviewStore.getState().setFps(fps),
      onFrame: (_delta, _builtins, elapsedMs) => {
        // Telemetry is unconditional (#150): publish elapsed every frame so the
        // readout's elapsed cell always tracks, independent of variable watching.
        usePreviewStore.getState().setElapsed(elapsedMs)
        if (!usePreviewStore.getState().watchPatternVars) return
        // Watched values live in the pattern's numeric domain (raw int32 in
        // fidelity mode); decode scalars and array elements to the float UI
        // domain so the panel reads the same in fast and fidelity modes.
        // decodeScalar is identity in fast mode.
        const dec = shim.decodeScalar
        const values: Record<string, unknown> = {}
        const exports = handle.getExports()
        for (const name of useEditorStore.getState().patternVars) {
          values[name] = snapshotWatchValue(exports[name], dec)
        }
        usePreviewStore.getState().setWatchValues(values)
      },
    })

    loopRef.current = loop
    loop.renderPreviewFrame()

    if (usePreviewStore.getState().isRunning) loop.start()

    return () => loop.stop()
  }, [previewSource, viewport, fidelity, libraries, activeMapId, activeShapeId, activeSurfaceId, previewPixelCount, pixelCountCap, activeNormalizeMode, activeDemoName])

  // Seed the live working state from the resolved settings cascade on open:
  // one pass that composes per-pattern override → recommended (demos) → global-sticky
  // → dev-default for every field and pushes the result into mapStore.active* +
  // previewStore live values. Replaces the former separate hydrate/solidity effects.
  // Fires on a pattern OR demo switch so a read-only demo opens on its recommendation.
  // The renderer then reads the seeded live values per frame as before — the resolver
  // never runs on a frame. Manipulation (deck handlers) writes the matching layer; we
  // no longer reactively persist the whole layout, so a dimension-correction in the
  // build effect is display-only and never written back as a spurious override.
  useEffect(() => {
    seedActiveSettings()
  }, [activePatternId, activeDemoName])

  // Forward control value changes to the live pattern handle
  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return
    // Control values arrive in the float UI domain; encode to the pattern's
    // numeric domain (raw int32 in fidelity mode) before invoking callbacks.
    const enc = shimRef.current?.encodeScalar ?? ((n: number) => n)
    for (const [name, value] of Object.entries(controlValues)) {
      if (Array.isArray(value)) handle.controls[name]?.(...(value as number[]).map(enc))
      else handle.controls[name]?.(enc(value))
    }
    if (!usePreviewStore.getState().isRunning) {
      loopRef.current?.renderPreviewFrame()
    }
  }, [controlValues])

  // Re-fit the 2D canvas to the viewport without rebuilding the loop (e.g. a light-
  // size change). The layout's pos is unchanged, so this only re-fits the canvas.
  useEffect(() => {
    if (!viewport) return
    rendererRef.current?.resize2D(viewport)
    if (!usePreviewStore.getState().isRunning) {
      loopRef.current?.renderPreviewFrame()
    }
  }, [viewport])

  // Start / stop when isRunning changes
  useEffect(() => {
    const loop = loopRef.current
    if (!loop) return
    if (isRunning) loop.start()
    else {
      loop.stop()
      usePreviewStore.getState().setFps(null)
      usePreviewStore.getState().setElapsed(null)
    }
  }, [isRunning])

  // Repaint on camera change while paused (drag-to-orbit / reset / auto-orbit).
  // While the pattern runs the loop already repaints every frame, so only act
  // when stopped. Subscribing outside React keeps the 60fps camera churn off the
  // component tree.
  useEffect(() => {
    return useCameraStore.subscribe((state) => {
      const r = rendererRef.current
      if (!r) return
      r.setCamera(state.camera)
      r.setZoom(state.zoom)
      if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
    })
  }, [])

  // Pole wrap density (#146): re-derive the 3D draw positions when the slider
  // moves, WITHOUT rebuilding the loop or reloading the pattern. The Pole shape
  // does not own `sample`, so wrap density only changes where dots are drawn — a
  // cheap `set3DPositions` + repaint, not a full effect re-run. Gated
  // on the pole being the live layout (a 3D shape over the square 3D viewport).
  const poleCols = useCameraStore((s) => s.poleCols)
  useEffect(() => {
    const canvas3DPx = canvas3DPxRef.current
    if (activeShapeId !== 'pole' || displayDim !== 3 || canvas3DPx == null) return
    const renderer = rendererRef.current
    if (!renderer) return
    const count = clampPixelCount(previewPixelCount ?? DEFAULT_SHAPE_PIXEL_COUNT)
    const pole = resolvePole(count, poleCols)
    renderer.set3DPositions(pole.positions, { canvasPx: canvas3DPx, normals: pole.normals })
    // set3DPositions re-measures the layout's neighbour pitch + extent, so the orb
    // sizing and diffusion glow track the new geometry; reassert diffusion + solidity.
    renderer.setDiffusion(usePreviewStore.getState().diffusion)
    renderer.setSolidity(useMapStore.getState().activeSolidity)
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [poleCols, activeShapeId, displayDim, previewPixelCount])

  // Auto-orbit drive: an independent rAF that advances the turntable whenever a
  // 3D layout is active and auto-orbit is armed — decoupled from the pattern's
  // play/pause, so the viewport keeps spinning even while the pattern is paused.
  // It only advances the angle; the subscription above (paused) and the render
  // loop (running) handle the actual repaint.
  useEffect(() => {
    if (displayDim !== 3) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const { autoOrbit, dragging, camera, setCamera } = useCameraStore.getState()
      // Hold the spin still while dragging; it resumes on release. Only the
      // play/pause control changes the persistent `autoOrbit` intent.
      if (autoOrbit && !dragging) setCamera(advanceAutoOrbit(camera, dt))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [displayDim])

  // Brightness: read live by the render loop's paint() each frame, so while the
  // pattern runs a brightness change shows on the next frame for free. But a paused
  // preview isn't painting, so — like every other deck control below — force one
  // repaint when paused so dragging brightness updates the image immediately
  // instead of doing nothing until play is pressed.
  useEffect(() => {
    if (!rendererRef.current) return
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [brightness])

  // Diffusion (per-source glow): pushed into the WebGL renderer, which
  // grows a soft glow tail around each source's solid core to merge neighbours
  // like a physical diffuser — no whole-frame blur, so cores stay crisp, the array
  // edge never goes furry, and the 3D silhouette never smears. Repaint while paused
  // so the change shows immediately.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setDiffusion(diffusion)
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [diffusion])

  // Solidity (back-face terminator fade): pushed into the renderer,
  // which folds a normal·viewDir multiplier into the 3D per-vertex brightness when
  // the layout supplies normals. A no-op in 2D / for ineligible embeddings (no
  // normals fed). Repaint while paused so the change shows immediately.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setSolidity(activeSolidity)
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [activeSolidity])

  // Dev-only (`?capture`) automation API on window. Lets browser automation drive
  // the preview deterministically: `setPreview({ diffusion: 0.5 })` merges into the
  // store — firing the control effects above, which repaint a paused preview — and
  // `capture(name)` forces a fresh paint and resolves once the frame has been saved
  // to /__capture. Bypasses synthetic slider events entirely.
  useEffect(() => {
    if (!captureEnabled()) return
    const cap = captureRef.current
    const w = window as unknown as { __pxlblz?: unknown }
    w.__pxlblz = {
      setPreview: (patch: Parameters<typeof usePreviewStore.setState>[0]) =>
        usePreviewStore.setState(patch),
      capture: (name = 'capture.png') => {
        const done = cap.request(name)
        // Defer the forced paint to a macrotask so any setState-driven control
        // effects (diffusion/solidity push into the renderer) flush first —
        // otherwise we'd snapshot the frame before the new value is applied.
        // A control change while paused already repaints (fulfilling the pending
        // request with the correct frame); this forced paint is the fallback for
        // a capture with no preceding change.
        setTimeout(() => loopRef.current?.renderPreviewFrame(), 0)
        return done
      },
      // Swap the previewed source without touching pattern records — lets the
      // render driver present an arbitrary pattern file, and (via a '' toggle
      // while paused) rebuild the loop on a fresh virtual clock so captures
      // start from pattern t=0 (#576).
      loadSource: (code: string) => useEditorStore.getState().setPreviewSource(code),
      getPreviewSource: () => useEditorStore.getState().previewSource ?? '',
      // Deterministic frame-sequence capture (#576): halt the rAF advance and
      // step the loop one fixed timestep per saved frame, so frame K sits at
      // exactly K * (1000/fps) virtual ms no matter how slowly frames save.
      captureSequence: async (opts: CaptureSequenceOptions) => {
        const loop = loopRef.current
        if (!loop) throw new Error('No preview render loop is active.')
        loop.stop()
        try {
          return await runCaptureSequence({
            requestCapture: (name) => cap.request(name),
            tickFrame: (delta) => loop.tickFrame(delta),
          }, opts)
        } finally {
          if (usePreviewStore.getState().isRunning) loop.start()
        }
      },
    }
    return () => {
      delete w.__pxlblz
    }
  }, [])

  return (
    <div
      ref={rootRef}
      data-height-constrained={constrainCanvasHeight}
      className="h-full min-h-0 bg-zinc-950 flex flex-col overflow-clip"
    >
      {/* Canvas flush at the top of the pane (#150): no header strip above it. The
          container drives the ResizeObserver fit; the deck stacks below. */}
      <div ref={containerRef} className="relative w-full shrink-0">
        <div className="relative block w-fit">
          <canvas ref={canvasRef} className="rounded-sm" />
          {/* Orbit viewport controls — gated on the active layout's display
              dimension (#129), so a 1D pattern on a 3D shape still gets them. Now
              at the top-right, clear of the navigation deck below the canvas. */}
          {displayDim === 3 && (
            <OrbitControls
              canvasRef={canvasRef}
              viewKey={`pattern:${activeMapId ?? ''}:${activeShapeId ?? ''}:${activeSurfaceId ?? ''}`}
            />
          )}
          {runtimeError && (
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-zinc-900/80 rounded-lg px-4 py-3 max-w-[90%]">
                <span className="text-red-400 text-sm font-mono break-words">
                  {runtimeError}
                </span>
              </div>
            </div>
          )}
          {showsLastWorkingPreview && (
            <div
              role="status"
              data-testid="preview-last-working"
              className="absolute left-2 bottom-2 z-10 rounded border border-amber-400/30 bg-zinc-950/85 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-amber-300/80 pointer-events-none"
              title="The current source has errors. The preview is showing the last working version."
            >
              Last working preview
            </div>
          )}
          {previewUnavailableReason !== null && (
            <div
              role="status"
              aria-live="polite"
              data-testid="preview-unavailable"
              className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950 p-6 pointer-events-none"
            >
              <div className="max-w-xs text-center font-mono">
                <div className="text-sm font-medium text-amber-300">Preview unavailable</div>
                <div className="mt-2 text-xs leading-5 text-zinc-400">
                  {previewUnavailableReason === 'empty-source'
                    ? 'Add valid Pattern source to start it.'
                    : 'Fix the source errors to restart it.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {showDeck && (
        <div data-testid="preview-controls-region" className="min-h-[180px] flex-1 overflow-clip">
          <PreviewDeck />
        </div>
      )}
    </div>
  )
}
