export interface PersonalContentName {
  id: string
  name: string
}

interface PersonalContentIdCrypto {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

export function newPersonalContentId(
  cryptoSource: PersonalContentIdCrypto | undefined = globalThis.crypto as unknown as PersonalContentIdCrypto | undefined,
): string {
  if (typeof cryptoSource?.randomUUID === 'function') return cryptoSource.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof cryptoSource?.getRandomValues === 'function') {
    cryptoSource.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function toWorkspaceIsoDate(updatedAt: number): string {
  const date = new Date(updatedAt)
  if (!Number.isFinite(updatedAt) || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${updatedAt}`)
  }
  return date.toISOString()
}

export function fromWorkspaceIsoDate(updatedAt: string): number {
  const time = Date.parse(updatedAt)
  if (!Number.isFinite(time)) throw new Error(`Invalid ISO date: ${updatedAt}`)
  return time
}

export function safeWorkspaceFileStem(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
  const stem = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'untitled'
}

export function assertSafeWorkspaceFileName(fileName: string): void {
  if (
    fileName.includes('/') ||
    fileName.includes('\\') ||
    fileName.includes('..') ||
    !/^[a-z0-9][a-z0-9._-]*\.json$/.test(fileName)
  ) {
    throw new Error(`Unsafe workspace filename: ${fileName}`)
  }
}

export function workspaceFileNameForRecord(
  record: PersonalContentName,
  usedFileNames: ReadonlySet<string> = new Set(),
): string {
  const id = safeWorkspaceFileStem(record.id)
  const base = safeWorkspaceFileStem(record.name)
  let fileName = `${base}--${id}.json`
  let suffix = 2
  while (usedFileNames.has(fileName)) {
    fileName = `${base}--${id}-${suffix}.json`
    suffix += 1
  }
  assertSafeWorkspaceFileName(fileName)
  return fileName
}
