/**
 * Web Storage for the shared-process `node` Vitest project.
 *
 * Node 24 defines `localStorage` and `sessionStorage` as globals that read
 * `undefined` rather than throwing. Zustand's `createJSONStorage` captures the
 * storage once, when a persisted store module is first imported, and only
 * disables persistence when that read throws; an `undefined` read leaves a
 * wrapper that crashes on the first `setItem`. With `isolate: false` the
 * outcome then depended on whether some earlier test file in the same worker
 * happened to have a storage stub installed at that import, so which files
 * failed moved whenever the file set changed (#1039).
 *
 * Installing an in-memory storage before every test file makes the import
 * deterministic. It is cleared per file so persisted state never crosses files.
 */
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, String(value)) }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const current = (globalThis as Record<string, unknown>)[name] as Storage | undefined
  if (current && typeof current.setItem === 'function') current.clear()
  else Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true })
}
