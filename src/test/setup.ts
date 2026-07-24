import '@testing-library/jest-dom'

// jsdom reports every canvas context probe through its virtual console. The app
// already treats a missing context as a supported fallback, so model that
// capability directly instead of filtering the error channel. Keep it
// configurable so context-specific tests can install a richer fake.
function getContextWithoutCanvas(): null {
  return null
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  writable: true,
  value: getContextWithoutCanvas,
})

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
