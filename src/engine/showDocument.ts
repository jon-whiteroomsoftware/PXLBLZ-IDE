import type { ShowRecord } from './personalContentRecords'
import {
  parseProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'

export type ShowDocument = ShowRecord | ShowRecordV2

export function isShowRecordV2(value: unknown): value is ShowRecordV2 {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { version?: unknown }).version === 2
}

export function cloneValidShowRecordV2(value: unknown): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(JSON.stringify(value))
  if (opened.status === 'refused') {
    const first = opened.issues[0]
    throw new Error(`Invalid Show v2 record at ${first?.path ?? '/'}: ${first?.message ?? 'validation failed'}`)
  }
  return opened.record
}

export function validateShowDocumentV2(record: ShowRecordV2): void {
  const first = validateShowRecordV2(record)[0]
  if (first) throw new Error(`Invalid Show v2 record at ${first.path}: ${first.message}`)
}
