import { buildShowEpeExportV2 } from '@/engine/showEpeExportV2'
import type { ShowEpeExport, ShowEpeExportOptions } from '@/engine/showEpeExport'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import type { ShowCompileRecipeSourceLookup } from '@/engine/showModel'
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { convertibleV1Show } from './showV2TracerFixture'

/** Convert a v1 test Show; throws with the converter's message unless it converts. */
export function convertedV2Record(show: ShowRecord, lookup?: ShowCompileRecipeSourceLookup): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(show, lookup)
  if (result.status !== 'converted') throw new Error(result.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))
  return result.record
}

/** convertedV2Record(convertibleV1Show()). */
export function convertibleV2Record(): ShowRecordV2 {
  return convertedV2Record(convertibleV1Show())
}

/** buildShowEpeExportV2, throwing Error(message) when it refuses. */
export function exportShowEpeV2ForTest(record: ShowRecordV2, generatedCode: string, options?: ShowEpeExportOptions): ShowEpeExport {
  const result = buildShowEpeExportV2(record, generatedCode, options)
  if (result.status !== 'exported') throw new Error(result.message)
  return result
}
