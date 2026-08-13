// Which render functions a pattern defines. Threaded from bundle() so the
// runtime can dispatch by dimensionality and the UI can label the pattern.
export interface RenderFns {
  hasBeforeRender: boolean
  hasRender2D: boolean
  hasRender: boolean
  hasRender3D: boolean
}

export interface PatternMetadata {
  exportedVars: string[]
  patternVars: string[]  // all top-level var declarations, exported or not
  /** Final bundled runtime vars used for state capture, including library globals.
   * The watcher remains intentionally scoped to authored patternVars. */
  runtimeVars?: string[]
  /** Runtime function declarations used to remap stateless function values
   * when replay state moves between evaluated copies of the same artifact. */
  patternFunctions?: string[]
  // Optional runtime identifier for each stable watcher key. Generated Shows
  // use this to compact delivered symbols without changing introspection names.
  patternVarBindings?: Record<string, string>
  controls: {
    exportName: string
    kind: string
    label: string
    // Curated, end-user-facing description of what the control does. Filled in
    // for demo controls by withControlDescriptions() at the demo-loading layer
    // (issue #190); bundle() never sets it, so user/imported patterns fall back
    // to the humanized label.
    description?: string
    // Curated presentation for sliders whose raw 0..1 value encodes seconds
    // linearly (value * scale). Attached at the demo-loading layer like
    // description (#819); the UI offers an exact seconds field for these.
    secondsPresentation?: { scale: number; minSeconds: number }
    // For pickers only: the top-level vars backing each arg (h,s,v or r,g,b),
    // in arg order. Lets the UI seed the swatch from the pattern's init values.
    pickerVars?: string[]
  }[]
  // Present when produced by bundle(); absent in hand-built test metadata.
  renderFns?: RenderFns
  /** Compiler-owned temporal state that preview seeking may deliberately clear. */
  temporalFeedback?: {
    previewSeekModeVar: string
  }
  /** Compiler proof that deterministic replay may omit intermediate renderer
   * traversals while preserving complete runtime state. Absence is unsafe. */
  deterministicReplay?: {
    intermediateRender: 'state-pure'
  }
}

export interface PatternHandle {
  beforeRender: (delta: number) => void
  // Exact dimensional render slots. Cross-dimensional selection and coordinate
  // adaptation live in renderCompatibility/renderLoop, not hidden in the handle.
  render: (index: number, x?: number) => void
  render2D: (index: number, x: number, y: number) => void
  render3D: (index: number, x: number, y: number, z: number) => void
  getExports: () => Record<string, unknown>
  /** Browser-runtime seam for complete replay state; never emitted to Pixelblaze. */
  getRuntimeState: () => Record<string, unknown>
  getPatternFunctions: () => Record<string, (...args: never[]) => unknown>
  /** Browser-runtime seam for mutable function declarations; never emitted to Pixelblaze. */
  setPatternFunction: (name: string, value: (...args: never[]) => unknown) => boolean
  /** Browser-runtime seam for authored Pattern state; never emitted to Pixelblaze. */
  setPatternVar: (name: string, value: unknown) => boolean
  /** Browser-runtime seam for complete replay state; never emitted to Pixelblaze. */
  setRuntimeVar: (name: string, value: unknown) => boolean
  controls: Record<string, (...args: number[]) => void>
}

// A pattern's native dimensionality is the highest render fn it defines:
// render3D -> 3, render2D -> 2, render -> 1. Drives the default layout picked
// on open and the title-bar label (not per-frame dispatch). Patterns defining
// no render fn fall back to 2 (the historical preview default).
export function nativeDimension(renderFns: RenderFns | undefined): 1 | 2 | 3 {
  if (!renderFns) return 2
  if (renderFns.hasRender3D) return 3
  if (renderFns.hasRender2D) return 2
  if (renderFns.hasRender) return 1
  return 2
}

export function loadPattern(
  code: string,
  metadata: PatternMetadata,
  builtins: Record<string, unknown>,
): PatternHandle {
  const stripped = code.replace(/\bexport\s+/g, '')
  const epilogue = buildEpilogue(metadata)
  const paramNames = Object.keys(builtins)
  const paramValues = Object.values(builtins)
  const factory = new Function(...paramNames, `${stripped}\n${epilogue}`)
  return factory(...paramValues) as PatternHandle
}

// Setter parameters live in the same scope chain as Pattern identifiers, so a
// Pattern global literally named `name` or `value` would be shadowed and the
// generated assignment would silently target the parameter. Derive parameter
// names guaranteed absent from every identifier the epilogue can reference.
function epilogueParamNames(metadata: PatternMetadata): { nameParam: string; valueParam: string } {
  const taken = new Set<string>([
    ...metadata.patternVars,
    ...(metadata.runtimeVars ?? []),
    ...(metadata.patternFunctions ?? []),
    ...Object.values(metadata.patternVarBindings ?? {}),
  ])
  const pick = (base: string): string => {
    let candidate = base
    while (taken.has(candidate)) candidate = `${candidate}_`
    return candidate
  }
  return { nameParam: pick('name'), valueParam: pick('value') }
}

function buildEpilogue(metadata: PatternMetadata): string {
  const { nameParam, valueParam } = epilogueParamNames(metadata)
  // Authored Pattern state remains the watcher/control-default surface.
  const getExportsEntries = metadata.patternVars
    .map((v) => {
      const runtimeName = metadata.patternVarBindings?.[v] ?? v
      return `${JSON.stringify(v)}:(typeof ${runtimeName}!=='undefined'?${runtimeName}:undefined)`
    })
    .join(',')

  // Replay additionally captures globals parsed from the final bundled artifact.
  // A runtimeVars entry is a declared identifier in both emitted variants, so its
  // setter can restore an uninitialized declaration without a typeof guard.
  const runtimeStateVars = new Map(metadata.patternVars.map((name) => [name, {
    runtimeName: metadata.patternVarBindings?.[name] ?? name,
    declared: false,
  }]))
  for (const name of metadata.runtimeVars ?? []) {
    runtimeStateVars.set(name, { runtimeName: name, declared: true })
  }
  const getRuntimeStateEntries = [...runtimeStateVars]
    .map(([name, { runtimeName, declared }]) => (
      `${JSON.stringify(name)}:${declared ? runtimeName : `(typeof ${runtimeName}!=='undefined'?${runtimeName}:undefined)`}`
    ))
    .join(',')

  const controlsEntries = metadata.controls
    .map(c => `${JSON.stringify(c.exportName)}:(typeof ${c.exportName}==='function'?${c.exportName}:function(){})`)
    .join(',')

  const patternFunctionEntries = (metadata.patternFunctions ?? [])
    .map(name => `${JSON.stringify(name)}:(typeof ${name}==='function'?${name}:undefined)`)
    .join(',')

  const setPatternFunctionCases = (metadata.patternFunctions ?? [])
    .map(name => `case ${JSON.stringify(name)}:if(typeof ${name}==='function'){${name}=${valueParam};return true;}return false;`)
    .join('')

  const setPatternVarCases = metadata.patternVars
    .map((name) => {
      const runtimeName = metadata.patternVarBindings?.[name] ?? name
      return `case ${JSON.stringify(name)}:if(typeof ${runtimeName}!=='undefined'){${runtimeName}=${valueParam};return true;}return false;`
    })
    .join('')

  const setRuntimeVarCases = [...runtimeStateVars]
    .map(([name, { runtimeName, declared }]) => declared
      ? `case ${JSON.stringify(name)}:${runtimeName}=${valueParam};return true;`
      : `case ${JSON.stringify(name)}:if(typeof ${runtimeName}!=='undefined'){${runtimeName}=${valueParam};return true;}return false;`)
    .join('')

  return [
    'return {',
    '  beforeRender:typeof beforeRender==="function"?beforeRender:function(delta){},',
    // Exact dimensional slots; the compatibility policy chooses among them.
    '  render:typeof render==="function"?render:function(index){},',
    '  render2D:typeof render2D==="function"?render2D:function(index,x,y){},',
    '  render3D:typeof render3D==="function"?render3D:function(index,x,y,z){},',
    `  getExports:function(){return{${getExportsEntries}};},`,
    `  getRuntimeState:function(){return{${getRuntimeStateEntries}};},`,
    `  getPatternFunctions:function(){return{${patternFunctionEntries}};},`,
    `  setPatternFunction:function(${nameParam},${valueParam}){switch(${nameParam}){${setPatternFunctionCases}default:return false;}},`,
    `  setPatternVar:function(${nameParam},${valueParam}){switch(${nameParam}){${setPatternVarCases}default:return false;}},`,
    `  setRuntimeVar:function(${nameParam},${valueParam}){switch(${nameParam}){${setRuntimeVarCases}default:return false;}},`,
    `  controls:{${controlsEntries}},`,
    '};',
  ].join('\n')
}
