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
  it('initializes the bridge and refuses access before registration', () => {
    const context = fixture()
    expect(runInContext('Object.keys(window.__benchPageAccess).sort().join(",")', context))
      .toBe('armConnect,assertReady,getProvider,getSaveState,registerProvider,registerStore,waitForConnect')
    for (const method of ['assertReady', 'getProvider', 'getSaveState', 'armConnect']) {
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
        connect() {} getPixelMap() {} getPixelMapData() {} getVars() {} getTelemetry() {} checkFirmwareUpdate() {}
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
      const state = { pushing: false, pushResult: { ok: true, id: 'saved-id' }, unrelated: 'excluded', async addController() {} }
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

// Exercise the CLI-serialized bridge, including startup failures swallowed by
// the product action. Deferred promises provide causal checkpoints, not sleeps.
function startupFixture() {
  const context = fixture()
  runInContext(`
    const access = window.__benchPageAccess;
    const spans = [];
    const reads = new Map();
    const started = new Map();
    const deferred = { make() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; } };
    const keys = ['connect', 'bootstrap-config', 'map', 'seed', 'list', 'panel-config', 'vars', 'telemetry', 'extra-map', 'firmware'];
    for (const key of keys) { reads.set(key, deferred.make()); started.set(key, deferred.make()); }
    let firmwareDelegates = 0;
    let configCalls = 0;
    let holdFirmware = false;
    let skipVars = false;
    window.__i20Span = async function (event) {
      spans.push(event);
      if (event.method === 'checkFirmwareUpdate' && event.phase === 'start') {
        started.get('firmware').resolve();
        if (holdFirmware) await reads.get('firmware').promise;
      }
    };
    const effects = { read(key) { started.get(key).resolve(); return reads.get(key).promise; } };
    class MemoryProvider {
      getStatus() { return { kind: 'connected' }; }
      compile() {} getActiveProgramBytecodeSize() {} saveProgram() {}
      pushBytecode() {} readSavedProgram() {} setVars() {}
      setRendererPaused() {} setControls() {} setBrightness() {} setName() {}
      setPixelCount() {} setActiveProgram() {} deleteProgram() {} setPixelMap() {}
      connect() { return effects.read('connect'); }
      getConfig() { return effects.read(++configCalls === 1 ? 'bootstrap-config' : 'panel-config'); }
      getPixelMapData() { return effects.read('map'); }
      listPrograms() { return effects.read('list'); }
      getVars() { return effects.read('vars'); }
      getTelemetry() { return effects.read('telemetry'); }
      getPixelMap() { return effects.read('extra-map'); }
      checkFirmwareUpdate() { firmwareDelegates++; throw new Error('Firmware traffic forbidden'); }
    }
    access.registerProvider(MemoryProvider);
    const provider = new MemoryProvider();
    const state = { async addController() {
      await provider.connect().catch(() => {});
      await Promise.all([provider.getConfig().catch(() => null), provider.getPixelMapData().catch(() => null)]);
      started.get('seed').resolve();
      await reads.get('seed').promise;
      void provider.listPrograms().catch(() => {});
      void provider.getConfig().catch(() => null);
      if (!skipVars) void provider.getVars().catch(() => null);
      void provider.getTelemetry().catch(() => null);
      void provider.getPixelMap().catch(() => null);
      void provider.checkFirmwareUpdate().catch(() => {});
    } };
    access.registerStore({ getState() { return state; } }, function () { return provider; });
    let outcome = 'pending';
    const driver = {
      begin() { access.armConnect(); void state.addController(); return access.waitForConnect().then(() => { outcome = 'ready'; }, error => { outcome = error.message; }); },
      release(key, fail = false) { const read = reads.get(key); if (fail) read.reject(new Error(key + ' failed')); else read.resolve(); },
      started(key) { return started.get(key).promise; }
    };
  `, context)
  return context
}

async function advanceStartup(context: ReturnType<typeof startupFixture>, hold?: string, fail?: string) {
  runInContext('void driver.begin()', context)
  for (const key of ['connect', 'bootstrap-config', 'map', 'seed', 'list', 'panel-config', 'vars', 'telemetry', 'extra-map', 'firmware']) {
    await runInContext(`driver.started(${JSON.stringify(key)})`, context)
    if (key !== hold) runInContext(`driver.release(${JSON.stringify(key)}, ${key === fail})`, context)
    if (key === hold && ['connect', 'bootstrap-config', 'map', 'seed'].includes(key)) return
  }
}

describe('explicit Connect startup barrier', () => {
  it('refuses unarmed, unobserved and repeated Connect without executing the action', async () => {
    const context = startupFixture()
    await expect(runInContext('state.addController()', context)).rejects.toThrow('Unarmed or repeated bench Connect')
    await expect(runInContext('access.waitForConnect()', context)).rejects.toThrow('Explicit bench Connect was not observed')
    runInContext('access.armConnect()', context)
    await expect(runInContext('access.waitForConnect()', context)).rejects.toThrow('Explicit bench Connect was not observed')
    expect(() => runInContext('access.armConnect()', context)).toThrow('Repeated bench Connect refused')
    expect(runInContext('spans.length', context)).toBe(0)
  })

  it('refuses an action that finishes without a required startup read', async () => {
    const context = startupFixture()
    runInContext('skipVars = true; void driver.begin()', context)
    for (const key of ['connect', 'bootstrap-config', 'map', 'seed', 'list', 'panel-config', 'telemetry', 'extra-map', 'firmware']) {
      await runInContext(`driver.started(${JSON.stringify(key)})`, context)
      runInContext(`driver.release(${JSON.stringify(key)})`, context)
    }
    await expect(runInContext('access.waitForConnect()', context)).rejects.toThrow('Incomplete Controller startup: getVars')
    expect(runInContext('outcome', context)).toBe('Incomplete Controller startup: getVars')
  })

  it.each(['connect', 'bootstrap-config', 'map', 'list', 'panel-config', 'vars', 'telemetry', 'extra-map', 'firmware'])(
    'does not return while %s is pending', async key => {
      const context = startupFixture()
      runInContext('holdFirmware = true', context)
      await advanceStartup(context, key)
      expect(runInContext('outcome', context)).toBe('pending')
      runInContext(`driver.release(${JSON.stringify(key)})`, context)
      // Complete any reads which the held bootstrap prevented from starting.
      for (const next of ['bootstrap-config', 'map', 'seed', 'list', 'panel-config', 'vars', 'telemetry', 'extra-map', 'firmware']) {
        await runInContext(`driver.started(${JSON.stringify(next)})`, context)
        runInContext(`driver.release(${JSON.stringify(next)})`, context)
      }
      await runInContext('access.waitForConnect()', context)
      expect(runInContext('outcome', context)).toBe('ready')
      expect(runInContext('firmwareDelegates', context)).toBe(0)
      expect(runInContext("spans.some(s => s.method === 'checkFirmwareUpdate' && s.phase === 'suppressed')", context)).toBe(true)
    },
  )

  it('does not mistake an empty span set before panel seed for readiness', async () => {
    const context = startupFixture()
    await advanceStartup(context, 'seed')
    expect(runInContext("spans.filter(s => s.phase === 'start').length === spans.filter(s => s.phase === 'end').length", context)).toBe(true)
    expect(runInContext('outcome', context)).toBe('pending')
    runInContext("driver.release('seed')", context)
    for (const key of ['list', 'panel-config', 'vars', 'telemetry', 'extra-map', 'firmware']) {
      await runInContext(`driver.started(${JSON.stringify(key)})`, context)
      runInContext(`driver.release(${JSON.stringify(key)})`, context)
    }
    await runInContext('access.waitForConnect()', context)
    expect(runInContext('outcome', context)).toBe('ready')
  })

  it.each(['connect', 'bootstrap-config', 'map', 'list', 'panel-config', 'vars', 'telemetry', 'extra-map'])(
    'propagates a swallowed %s failure', async key => {
      const context = startupFixture()
      await advanceStartup(context, undefined, key)
      await expect(runInContext('access.waitForConnect()', context)).rejects.toThrow(`${key} failed`)
      expect(runInContext('outcome', context)).toBe(`${key} failed`)
    },
  )
})
