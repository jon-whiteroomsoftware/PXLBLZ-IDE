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
    const assertReady = () => {
      if (ambiguous) throw new Error('Ambiguous page Controller store')
      if (!store || !getter || !constructors.size) throw new Error('Page Controller modules are unavailable')
    }
    window.__benchPageAccess = {
      assertReady,
      registerStore(next, nextGetter) {
        if (store && (store !== next || getter !== nextGetter)) {
          ambiguous = true
          throw new Error('Ambiguous page Controller store')
        }
        store = next
        getter = nextGetter
      },
      registerProvider(constructor) {
        const prototype = constructor.prototype as unknown as Record<string, unknown>
        if (prototype.__i20Wrapped) { constructors.add(constructor); return }
        const methods = ['compile', 'getActiveProgramBytecodeSize', 'saveProgram', 'pushBytecode', 'readSavedProgram', 'getConfig', 'listPrograms', 'setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setActiveProgram', 'deleteProgram', 'setPixelMap']
        for (const method of methods) {
          if (typeof prototype[method] !== 'function') throw new Error(`Missing real provider method ${method}`)
        }
        prototype.__i20Wrapped = true
        const w = window as unknown as { __i20Span: (message: unknown) => Promise<void> }
        let span = 0
        for (const method of methods) {
          const original = prototype[method] as (...args: unknown[]) => unknown
          prototype[method] = async function (this: ExtensionControllerProvider, ...args: unknown[]) {
            const id = ++span
            const common = { method, span: id, args: ['saveProgram', 'pushBytecode'].includes(method) ? [null, args[1]]
              : ['readSavedProgram', 'setActiveProgram', 'deleteProgram'].includes(method) ? [args[0], args[1]] : [], source: method === 'compile' ? args[0] : undefined }
            const bytes = ['saveProgram', 'pushBytecode'].includes(method) ? Array.from(args[0] as Uint8Array) : undefined
            await w.__i20Span({ ...common, phase: 'start', time: performance.now(), utc: new Date().toISOString(), bytes, status: this.getStatus() })
            try {
              void w.__i20Span({ ...common, phase: 'execute', time: performance.now(), utc: new Date().toISOString() })
              const result = await original.apply(this, args)
              await w.__i20Span({ ...common, phase: 'end', time: performance.now(), utc: new Date().toISOString(), bytes: method === 'compile' ? Array.from(result as Uint8Array) : undefined,
                result: ['getActiveProgramBytecodeSize', 'getConfig', 'listPrograms'].includes(method) ? result : undefined })
              return result
            } catch (error) {
              await w.__i20Span({ ...common, phase: 'error', time: performance.now(), utc: new Date().toISOString(), error: error instanceof Error ? error.message : 'Provider rejected' })
              throw error
            }
          }
        }
        constructors.add(constructor)
      },
      getProvider() {
        assertReady()
        const provider = getter!()
        for (const constructor of constructors) if (provider instanceof constructor) return provider
        throw new Error('Real ExtensionControllerProvider is required')
      },
      getSaveState() {
        assertReady()
        const { pushing, pushResult } = store!.getState()
        return { pushing, pushResult }
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
