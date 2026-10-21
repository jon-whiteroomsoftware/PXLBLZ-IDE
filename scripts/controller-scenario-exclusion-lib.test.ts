import { describe, it, expect } from 'vitest'
import {
  CONTROLLER_SCENARIO_NEEDLES,
  findNeedleHits,
  isScannedBundleFile,
  previewRefusals,
  type PreviewObservation,
} from './controller-scenario-exclusion-lib'

describe('findNeedleHits', () => {
  it('reports every file/needle pair, excluding clean and differently cased text', () => {
    expect(findNeedleHits([
      { path: 'assets/leaked.js', text: 'controllerScenario __pxlblzControllerScenario' },
      { path: 'assets/clean.js', text: 'production app' },
      { path: 'assets/case.js', text: 'ControllerScenario' },
    ], CONTROLLER_SCENARIO_NEEDLES)).toEqual([
      { path: 'assets/leaked.js', needle: '__pxlblzControllerScenario' },
      { path: 'assets/leaked.js', needle: 'controllerScenario' },
    ])
  })
})

describe('isScannedBundleFile', () => {
  it.each([
    'assets/index-abc.js', 'index.html', 'assets/x.css', 'assets/x.js.map',
    'assets/x.mjs', 'assets/x.json', 'assets/x.txt',
  ])('reads text bundle file %s', path => {
    expect(isScannedBundleFile(path)).toBe(true)
  })

  it.each(['assets/logo.png', 'fonts/a.woff2'])('skips binary asset %s', path => {
    expect(isScannedBundleFile(path)).toBe(false)
  })
})

describe('previewRefusals', () => {
  const clean: PreviewObservation = {
    scenarioGlobal: 'undefined', consoleLines: [], rootRendered: true,
  }
  const line = '[controller scenario] matched: ...'
  const rootRefusal = 'production preview did not render #root'
  const globalRefusal = 'window.__pxlblzControllerScenario is defined in production (typeof object)'
  const consoleRefusal = 'production console logged a controller scenario line: ' + line

  it('accepts a rendered production app without a scenario', () => {
    expect(previewRefusals(clean)).toEqual([])
  })

  it('refuses an unrendered root', () => {
    expect(previewRefusals({ ...clean, rootRendered: false })).toEqual([rootRefusal])
  })

  it('refuses a defined scenario global', () => {
    expect(previewRefusals({ ...clean, scenarioGlobal: 'object' })).toEqual([globalRefusal])
  })

  it('refuses each scenario console line and ignores other messages', () => {
    expect(previewRefusals({ ...clean, consoleLines: ['app loaded', line, line] }))
      .toEqual([consoleRefusal, consoleRefusal])
  })

  it('reports root, global, and console refusals in order', () => {
    expect(previewRefusals({
      rootRendered: false, scenarioGlobal: 'object', consoleLines: [line],
    })).toEqual([rootRefusal, globalRefusal, consoleRefusal])
  })
})
