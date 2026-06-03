import { describe, it, expect } from 'vitest'
import {
  getSubstring,
  extractCompiler,
  v3AdapterV3,
  missingComponents,
  buildCompilerEnv,
} from './compilerExtraction'

// A synthetic stand-in for the device's served web UI, carrying each anchor the
// adapter slices between. Tiny on purpose — it pins the slicing boundaries, not
// the real compiler.
const FAKE_WEB_UI = [
  '<html><head>',
  '<script>',
  'var hardwareVariant="PICO",varWatcherPoller=1;',
  'var x=0;',
  '"ESP8266"===hardwareVariant&&doThing(),otherConst=[1,2],[])',
  'extendedOperators={pow:1,root:2},lastErrorMarkers=[];',
  'window.compile = function(src){ return src };',
  '</script>',
  '</head></html>',
].join('\n')

describe('getSubstring', () => {
  it('slices [start, end)', () => {
    expect(getSubstring('abcDEFghi', 'DEF', 'ghi')).toBe('DEF')
  })
  it('returns empty when the start anchor is absent', () => {
    expect(getSubstring('abc', 'ZZZ', 'abc')).toBe('')
  })
  it('returns empty when the end anchor is absent', () => {
    expect(getSubstring('abc', 'a', 'ZZZ')).toBe('')
  })
})

describe('extractCompiler', () => {
  it('returns the script block defining window.compile', () => {
    const out = extractCompiler(FAKE_WEB_UI)
    expect(out).toContain('window.compile')
  })
  it('returns empty when no script defines window.compile', () => {
    expect(extractCompiler('<script>var a=1;</script>')).toBe('')
  })
})

describe('v3AdapterV3 + missingComponents', () => {
  it('extracts all four fragments from a matching web UI', () => {
    const c = v3AdapterV3(FAKE_WEB_UI)
    expect(missingComponents(c)).toEqual([])
    expect(c.hardwareVariant).toContain('hardwareVariant="PICO"')
    expect(c.extendedOperators).toContain('extendedOperators={pow:1,root:2}')
    expect(c.constants).toContain('"ESP8266"===hardwareVariant')
    expect(c.compiler).toContain('window.compile')
  })

  it('flags every missing fragment when the web UI does not match the adapter', () => {
    const c = v3AdapterV3('<html>nothing useful here</html>')
    expect(missingComponents(c).sort()).toEqual(
      ['compiler', 'constants', 'extendedOperators', 'hardwareVariant'].sort(),
    )
  })
})

describe('buildCompilerEnv', () => {
  it('exposes compilePattern and never prepends a window stub', () => {
    const env = buildCompilerEnv(v3AdapterV3(FAKE_WEB_UI))
    expect(env).toContain('var compilePattern = function (src)')
    expect(env).toContain('window.compile(src, compilerOptions)')
    expect(env).not.toContain('window = {}')
  })
})
