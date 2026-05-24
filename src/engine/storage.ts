const DB_NAME = 'pixelblaze-ide'
const DB_VERSION = 1
const STORE_PATTERNS = 'patterns'
const STORE_SETTINGS = 'settings'

export interface PatternRecord {
  id: string
  name: string
  src: string
  controls: Record<string, number | number[]>
  updatedAt: number
}

let _db: IDBDatabase | null = null

export function openDb(dbOverride?: IDBFactory): Promise<IDBDatabase> {
  if (_db && !dbOverride) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const factory = dbOverride ?? indexedDB
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_PATTERNS)) {
        db.createObjectStore(STORE_PATTERNS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS)
      }
    }
    req.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!dbOverride) _db = db
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

function tx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store)
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function createPattern(
  record: PatternRecord,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_PATTERNS, 'readwrite').put(record))
}

export async function listPatterns(db?: IDBDatabase): Promise<PatternRecord[]> {
  const d = db ?? (await openDb())
  return wrap<PatternRecord[]>(tx(d, STORE_PATTERNS, 'readonly').getAll())
}

export async function getPattern(
  id: string,
  db?: IDBDatabase,
): Promise<PatternRecord | undefined> {
  const d = db ?? (await openDb())
  return wrap<PatternRecord | undefined>(tx(d, STORE_PATTERNS, 'readonly').get(id))
}

export async function updatePattern(
  id: string,
  changes: Partial<Omit<PatternRecord, 'id'>>,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  const store = tx(d, STORE_PATTERNS, 'readwrite')
  const existing = await wrap<PatternRecord | undefined>(store.get(id))
  if (!existing) throw new Error(`Pattern ${id} not found`)
  await wrap(
    tx(d, STORE_PATTERNS, 'readwrite').put({ ...existing, ...changes }),
  )
}

export async function deletePattern(
  id: string,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_PATTERNS, 'readwrite').delete(id))
}

export async function getSetting<T>(
  key: string,
  db?: IDBDatabase,
): Promise<T | undefined> {
  const d = db ?? (await openDb())
  return wrap<T | undefined>(tx(d, STORE_SETTINGS, 'readonly').get(key))
}

export async function setSetting<T>(
  key: string,
  value: T,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_SETTINGS, 'readwrite').put(value, key))
}

export function resetDbCache(): void {
  _db = null
}
