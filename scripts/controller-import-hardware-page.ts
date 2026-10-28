import type { Page } from '@playwright/test'
import type { ControllerProvider } from '../src/engine/ControllerProvider'
import type { ExtensionControllerProvider } from '../src/engine/ExtensionControllerProvider'
import type { useControllerStore } from '../src/store/controllerStore'

type ProviderClass = typeof ExtensionControllerProvider
type ControllerStore = Pick<typeof useControllerStore, 'getState'>

declare global {
  interface Window {
    __benchPageAccess: {
      registerProvider(constructor: ProviderClass): void
      registerStore(store: ControllerStore, getter: () => ControllerProvider): void
      assertReady(): void
      getProvider(): ExtensionControllerProvider
      getSaveState(): Pick<ReturnType<ControllerStore['getState']>, 'pushing' | 'pushResult'>
      armConnect(): void
      waitForConnect(): Promise<void>
    }
  }
}

/** Register the identities evaluated by this page, including Vite's hot module URLs. */
export async function installBenchPageAccess(page: Page, origin: string): Promise<void> {
  const admittedOrigin = new URL(origin).origin
  await page.addInitScript(() => {
    const constructors = new Set<ProviderClass>()
    let store: ControllerStore | undefined
    let getter: (() => ControllerProvider) | undefined
    let ambiguous = false
    let startup: {
      operation?: Promise<void>
      pending: Set<Promise<void>>
      calls: Map<string, number>
      failures: unknown[]
      ready: boolean
    } | undefined
    // Method syntax keeps tsx keepNames from adding an external __name dependency to this serialized callback.
    const guards = {
      assertReady() {
        if (ambiguous) throw new Error('Ambiguous page Controller store')
        if (!store || !getter || !constructors.size) throw new Error('Page Controller modules are unavailable')
      },
    }
    window.__benchPageAccess = {
      assertReady: guards.assertReady,
      registerStore(next, nextGetter) {
        if (store && (store !== next || getter !== nextGetter)) {
          ambiguous = true
          throw new Error('Ambiguous page Controller store')
        }
        if (store) return
        const state = next.getState()
        const original = state.addController
        if (typeof original !== 'function') throw new Error('Page Controller connect action is unavailable')
        state.addController = function (...args) {
          const attempt = startup
          if (!attempt || attempt.operation) return Promise.reject(new Error('Unarmed or repeated bench Connect'))
          // Capture the whole action, including the asynchronous gap between
          // bootstrap reads and panel seed. An empty span set cannot prove this.
          const operation = Promise.resolve().then(() => original.apply(this, args))
          attempt.operation = operation
          void operation.catch(error => { attempt.failures.push(error) })
          return operation
        }
        store = next
        getter = nextGetter
      },
      registerProvider(constructor) {
        const prototype = constructor.prototype as unknown as Record<string, unknown>
        if (prototype.__i20Wrapped) { constructors.add(constructor); return }
        const methods = ['compile', 'getActiveProgramBytecodeSize', 'saveProgram', 'pushBytecode', 'readSavedProgram', 'connect', 'getConfig', 'listPrograms', 'getPixelMap', 'getPixelMapData', 'getVars', 'getTelemetry', 'checkFirmwareUpdate', 'setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setActiveProgram', 'deleteProgram', 'setPixelMap']
        for (const method of methods) {
          if (typeof prototype[method] !== 'function') throw new Error(`Missing real provider method ${method}`)
        }
        prototype.__i20Wrapped = true
        const w = window as unknown as { __i20Span: (message: unknown) => Promise<void> }
        let span = 0
        for (const method of methods) {
          const original = prototype[method] as (...args: unknown[]) => unknown
          prototype[method] = async function (this: ExtensionControllerProvider, ...args: unknown[]) {
            const attempt = startup?.ready ? undefined : startup
            let finish: (() => void) | undefined
            const pending = new Promise<void>(resolve => { finish = resolve })
            attempt?.pending.add(pending)
            if (attempt) attempt.calls.set(method, (attempt.calls.get(method) ?? 0) + 1)
            const id = ++span
            const common = { method, span: id, args: ['saveProgram', 'pushBytecode'].includes(method) ? [null, args[1]]
              : ['readSavedProgram', 'setActiveProgram', 'deleteProgram'].includes(method) ? [args[0], args[1]] : [], source: method === 'compile' ? args[0] : undefined }
            const bytes = ['saveProgram', 'pushBytecode'].includes(method) ? Array.from(args[0] as Uint8Array) : undefined
            try {
              await w.__i20Span({ ...common, phase: 'start', time: performance.now(), utc: new Date().toISOString(), bytes, status: this.getStatus() })
              let result: unknown
              if (method === 'checkFirmwareUpdate') {
                // Firmware traffic is excluded by this bench, including the
                // product's automatic availability check on every fresh page.
                await w.__i20Span({ ...common, phase: 'suppressed', time: performance.now(), utc: new Date().toISOString(), result: 'bench excludes firmware traffic' })
                result = 'unknown'
              } else {
                await w.__i20Span({ ...common, phase: 'execute', time: performance.now(), utc: new Date().toISOString() })
                result = await original.apply(this, args)
              }
              await w.__i20Span({ ...common, phase: 'end', time: performance.now(), utc: new Date().toISOString(), bytes: method === 'compile' ? Array.from(result as Uint8Array) : undefined,
                result: ['getActiveProgramBytecodeSize', 'getConfig', 'listPrograms', 'checkFirmwareUpdate'].includes(method) ? result : undefined })
              return result
            } catch (error) {
              attempt?.failures.push(error)
              await w.__i20Span({ ...common, phase: 'error', time: performance.now(), utc: new Date().toISOString(), error: error instanceof Error ? error.message : 'Provider rejected' })
              throw error
            } finally {
              attempt?.pending.delete(pending)
              finish!()
            }
          }
        }
        constructors.add(constructor)
      },
      getProvider() {
        guards.assertReady()
        const provider = getter!()
        for (const constructor of constructors) if (provider instanceof constructor) return provider
        throw new Error('Real ExtensionControllerProvider is required')
      },
      getSaveState() {
        guards.assertReady()
        const { pushing, pushResult } = store!.getState()
        return { pushing, pushResult }
      },
      armConnect() {
        guards.assertReady()
        if (startup) throw new Error('Repeated bench Connect refused')
        startup = { pending: new Set(), calls: new Map(), failures: [], ready: false }
      },
      async waitForConnect() {
        guards.assertReady()
        const attempt = startup
        if (!attempt?.operation) throw new Error('Explicit bench Connect was not observed')
        await attempt.operation
        // The action launches panel reads and the suppressed firmware check
        // without awaiting them. Retain each call until its final span settles.
        while (attempt.pending.size) await Promise.all(attempt.pending)
        if (attempt.failures.length) throw attempt.failures[0]
        for (const [method, count] of [['connect', 1], ['getConfig', 2], ['getPixelMapData', 1], ['listPrograms', 1], ['getVars', 1], ['getTelemetry', 1]] as const) {
          if ((attempt.calls.get(method) ?? 0) < count) throw new Error(`Incomplete Controller startup: ${method}`)
        }
        attempt.ready = true
      },
    }
  })
  await page.route(url => url.origin === admittedOrigin && (
    url.pathname.endsWith('/src/engine/ExtensionControllerProvider.ts') || url.pathname.endsWith('/src/store/controllerStore.ts')
  ), async route => {
    const response = await route.fetch()
    if (!response.ok() || !/\b(?:java|ecma)script\b/i.test(response.headers()['content-type'] ?? '')) {
      await route.abort('failed')
      return
    }
    const registration = new URL(route.request().url()).pathname.endsWith('/src/store/controllerStore.ts')
      ? 'window.__benchPageAccess.registerStore(useControllerStore, getControllerProvider);'
      : 'window.__benchPageAccess.registerProvider(ExtensionControllerProvider);'
    await route.fulfill({ response, body: `${await response.text()}\n;${registration}\n` })
  })
}
