// Extracts the Pixelblaze device's own pattern compiler out of its served web UI
// (H10, issue #202), so the relay helper can run it to turn pattern source into
// the bytecode the device executes. Ported verbatim from the proven H8 spike
// (test/h8-compiler-spike/extension/background.js) and pinned by tests against a
// synthetic web-UI fixture so a future refactor can't silently break the slicing.
//
// The flow upstream of this module: the helper fetches `http://<ip>/index.html.gz`,
// gunzips it, and hands the decoded HTML here. `v3AdapterV3` slices out the four
// source fragments (firmware > 3.4, incl. 3.67); `buildCompilerEnv` assembles them
// into one string the sandboxed iframe evals to expose `compilePattern(src)`.
//
// FIRMWARE ADAPTER: v3AdapterV3 covers fw > 3.4. Older firmware needs the v2 /
// v3v1 / v3v2 adapters from pixelblaze-client — a maintenance line item (#207),
// not handled here.
//
// Zero React, zero transport specifics. NB this string is *remote code* (the
// device's compiler); it may only be eval'd inside a sandboxed iframe under MV3
// CSP, never the service worker — see the extension wiring.
//
// DELIBERATE DUPLICATE: the production service worker (extension/background.js)
// runs its own plain-JS copy of getSubstring/extractCompiler/v3AdapterV3/
// buildCompilerEnv — it is outside the Vite bundle and can't import this module.
// This module is the tested mirror; keep the two in sync by hand.

/** The four source fragments sliced from the device web UI for fw > 3.4. */
export interface CompilerComponents {
  hardwareVariant: string
  extendedOperators: string
  constants: string
  compiler: string
}

/** Slice `[startValue, endValue)` out of `text`, anchored at the first occurrence
 *  of each. Returns '' when either anchor is absent — the caller treats an empty
 *  fragment as an adapter mismatch. */
export function getSubstring(text: string, startValue: string, endValue: string): string {
  const start = text.indexOf(startValue)
  if (start === -1) return ''
  const finish = text.indexOf(endValue, start)
  if (finish === -1) return ''
  return text.slice(start, finish)
}

/** Pull the inline `<script>` block that defines `window.compile` out of the web
 *  UI. Returns '' when no script block carries it. */
export function extractCompiler(webUI: string): string {
  let rest = webUI
  while (rest.length > 0) {
    const i = rest.indexOf('<script>')
    if (i === -1) break
    const after = rest.slice(i + '<script>'.length)
    const j = after.indexOf('</script>')
    const script = j === -1 ? after : after.slice(0, j)
    rest = j === -1 ? '' : after.slice(j + '</script>'.length)
    if (script.indexOf('window.compile') !== -1) return script
  }
  return ''
}

/** Extract all four compiler fragments for firmware > 3.4 (v3AdapterV3). */
export function v3AdapterV3(webUI: string): CompilerComponents {
  return {
    hardwareVariant: 'var ' + getSubstring(webUI, 'hardwareVariant=', ',varWatcherPoller') + ';',
    extendedOperators: getSubstring(webUI, 'extendedOperators={', ',lastErrorMarkers=') + ';',
    constants:
      'var constants;' + getSubstring(webUI, '"ESP8266"===hardwareVariant&&', ',[])') + ';',
    compiler: extractCompiler(webUI) + ';',
  }
}

/** The four fragments a `CompilerComponents` must carry non-empty for the
 *  assembled environment to be usable. A miss means the adapter didn't match the
 *  served web UI (wrong/old firmware). */
export const REQUIRED_COMPONENTS: (keyof CompilerComponents)[] = [
  'hardwareVariant',
  'extendedOperators',
  'constants',
  'compiler',
]

/** Names of any fragments that came back empty (i.e. their inner slice was ''),
 *  for an actionable extraction-miss error. A fragment is "empty" when it is just
 *  its wrapper boilerplate with nothing sliced in. */
export function missingComponents(c: CompilerComponents): (keyof CompilerComponents)[] {
  const innerEmpty: Record<keyof CompilerComponents, boolean> = {
    hardwareVariant: c.hardwareVariant === 'var ;',
    extendedOperators: c.extendedOperators === ';',
    constants: c.constants === 'var constants;;',
    compiler: c.compiler === ';',
  }
  return REQUIRED_COMPONENTS.filter((k) => innerEmpty[k])
}

/** Assemble the string the sandboxed iframe evals to expose `compilePattern(src)`
 *  → `{ status, exports?, compiled? }`. NB unlike the Python PoC we do NOT prepend
 *  `window = {}`: in a browser host `window` is read-only and the compiler attaches
 *  to the real one. */
export function buildCompilerEnv(c: CompilerComponents): string {
  return (
    'var predefinedGlobals = ["pixelCount"];\n' +
    c.hardwareVariant +
    '\n' +
    c.constants +
    '\n' +
    c.extendedOperators +
    '\n' +
    c.compiler +
    '\n' +
    `
    var compilePattern = function (src) {
      try {
        var compilerOptions = { predefinedGlobals: predefinedGlobals, extendedOperators: extendedOperators, constants: constants };
        var program = window.compile(src, compilerOptions);
        function surfaceList(list) { return Object.keys(list).reduce(function (r, k) { return r.concat(list[k]); }, []); }
        return { status: "OK", exports: surfaceList(program.exports), compiled: program.compiled };
      } catch (ex) {
        return { status: (ex && ex.description ? ex.description : String(ex)) };
      }
    };
    `
  )
}
