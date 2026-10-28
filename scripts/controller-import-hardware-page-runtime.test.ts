import { execFileSync } from 'node:child_process'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const callbackSource = execFileSync(process.execPath, [
  '--import', 'tsx', '--input-type=module', '--eval',
  `import { installBenchPageAccess } from ${JSON.stringify(new URL('./controller-import-hardware-page.ts', import.meta.url).href)};
  await installBenchPageAccess({ addInitScript(fn) { process.stdout.write(fn.toString()) }, route() {} }, 'http://bench.invalid')`,
], { encoding: 'utf8' })

function fixture() {
  const context = createContext({ window: {}, Date, performance, Uint8Array })
  // Execute the actual CLI-transformed callback without its module's lexical scope.
  runInContext(`(${callbackSource})()`, context)
  return context
}

describe('actual tsx page bridge serialization', () => {
  it('initializes all five methods and refuses access before registration', () => {
    const context = fixture()
    expect(runInContext('Object.keys(window.__benchPageAccess).sort().join(",")', context))
      .toBe('assertReady,getProvider,getSaveState,registerProvider,registerStore')
    for (const method of ['assertReady', 'getProvider', 'getSaveState']) {
      expect(runInContext(`typeof window.__benchPageAccess.${method}`, context)).toBe('function')
      expect(() => runInContext(`window.__benchPageAccess.${method}()`, context))
        .toThrow('Page Controller modules are unavailable')
    }
    for (const method of ['registerProvider', 'registerStore']) {
      expect(runInContext(`typeof window.__benchPageAccess.${method}`, context)).toBe('function')
    }
  })

  it('preserves VM provider identity, Save state and ordered memory delegates', async () => {
    const context = fixture()
    const result = await runInContext(`(async () => {
      const access = window.__benchPageAccess
      const events = []
      window.__i20Span = async function (event) {
        events.push({ method: event.method, phase: event.phase, span: event.span })
      }
      // Serialization fixture only: no real provider, browser or transport.
      class MemoryProvider {
        getStatus() { return 'connected' }
        compile() {} getActiveProgramBytecodeSize() {} saveProgram() {}
        pushBytecode() {} readSavedProgram() {} setVars() {}
        setRendererPaused() {} setControls() {} setBrightness() {} setName() {}
        setPixelCount() {} setActiveProgram() {} deleteProgram() {} setPixelMap() {}
        getConfig() {
          events.push({ method: 'getConfig', phase: 'delegate', receiver: this === provider })
          return this.config
        }
        listPrograms() {
          events.push({ method: 'listPrograms', phase: 'delegate', receiver: this === provider })
          return this.programs
        }
      }
      let missingMethod
      try { access.registerProvider(class Incomplete {}) } catch (error) { missingMethod = error.message }
      access.registerProvider(MemoryProvider)
      const provider = new MemoryProvider()
      provider.config = { name: 'Memory Controller', pixelCount: 24 }
      provider.programs = [['saved-id', 'Memory Pattern']]
      const state = { pushing: false, pushResult: { ok: true, id: 'saved-id' }, unrelated: 'excluded' }
      let selected = {}
      const store = { getState() { return state } }
      access.registerStore(store, function () { return selected })
      access.assertReady()
      let invalidProvider
      try { access.getProvider() } catch (error) { invalidProvider = error.message }
      selected = provider
      const actual = access.getProvider()
      const config = await actual.getConfig()
      const programs = await actual.listPrograms()
      const save = access.getSaveState()
      return { sameProvider: actual === provider, sameConfig: config === provider.config,
        samePrograms: programs === provider.programs, samePushResult: save.pushResult === state.pushResult,
        config, programs, save, missingMethod, invalidProvider, events }
    })()`, context)
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      sameProvider: true, sameConfig: true, samePrograms: true, samePushResult: true,
      config: { name: 'Memory Controller', pixelCount: 24 },
      programs: [['saved-id', 'Memory Pattern']],
      save: { pushing: false, pushResult: { ok: true, id: 'saved-id' } },
      missingMethod: 'Missing real provider method compile',
      invalidProvider: 'Real ExtensionControllerProvider is required',
      events: [
        { method: 'getConfig', phase: 'start', span: 1 },
        { method: 'getConfig', phase: 'execute', span: 1 },
        { method: 'getConfig', phase: 'delegate', receiver: true },
        { method: 'getConfig', phase: 'end', span: 1 },
        { method: 'listPrograms', phase: 'start', span: 2 },
        { method: 'listPrograms', phase: 'execute', span: 2 },
        { method: 'listPrograms', phase: 'delegate', receiver: true },
        { method: 'listPrograms', phase: 'end', span: 2 },
      ],
    })
  })
})
