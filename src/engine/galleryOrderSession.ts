export interface GalleryOrderSession {
  seed: number
  visit: number
}

type GalleryStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface GalleryOrderEnvironment {
  sessionStorage: () => GalleryStorage | null | undefined
  localStorage: () => GalleryStorage | null | undefined
  randomSeed: () => number
}

export const GALLERY_ORDER_SESSION_KEY = 'pxlblz-gallery-order-session'
export const GALLERY_VISIT_KEY = 'pxlblz-gallery-visit'

function safeStorage(read: () => GalleryStorage | null | undefined): GalleryStorage | null {
  try { return read() ?? null } catch { return null }
}

function read(storage: GalleryStorage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null } catch { return null }
}

function write(storage: GalleryStorage | null, key: string, value: string): void {
  try { storage?.setItem(key, value) } catch { /* The per-load choice remains cached. */ }
}

function visitIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function storedSession(raw: string | null): GalleryOrderSession | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<GalleryOrderSession> | null
    return value && visitIndex(value.seed) && value.seed <= 0xffffffff && visitIndex(value.visit)
      ? { seed: value.seed, visit: value.visit }
      : null
  } catch { return null }
}

/** Decimal uint32 seeds keep their value; arbitrary text gets a stable FNV-1a hash. */
function parameterSeed(value: string): number {
  const numeric = Number(value)
  if (/^\d+$/.test(value) && visitIndex(numeric) && numeric <= 0xffffffff) return numeric
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193)
  }
  return hash >>> 0
}

/** Storage is optional. Cache ordinary resolution across remounts and failed writes. */
export function createGalleryOrderSessionResolver(environment: GalleryOrderEnvironment) {
  let cached: GalleryOrderSession | null = null
  return (search: string): GalleryOrderSession => {
    const parameters = new URLSearchParams(search)
    if (parameters.has('seed')) {
      const seed = parameterSeed(parameters.get('seed')!)
      return { seed, visit: seed }
    }
    if (parameters.has('capture')) return { seed: 0, visit: 0 }
    if (cached) return cached

    const session = safeStorage(environment.sessionStorage)
    cached = storedSession(read(session, GALLERY_ORDER_SESSION_KEY))
    if (cached) return cached

    const local = safeStorage(environment.localStorage)
    const counter = Number(read(local, GALLERY_VISIT_KEY))
    const visit = visitIndex(counter) ? counter : 0
    cached = { seed: environment.randomSeed() >>> 0, visit }
    write(local, GALLERY_VISIT_KEY, String(visit === Number.MAX_SAFE_INTEGER ? 0 : visit + 1))
    write(session, GALLERY_ORDER_SESSION_KEY, JSON.stringify(cached))
    return cached
  }
}
