// Turning a legacy record into the version-2 subject a harness test needs
// (#1039).
//
// Some suites build their subject as a v1 record because that is the shape the
// case is about — a stock catalogue entry, a retired stock Pattern id, a Scene
// spec that reads as a pacing table. The harness itself no longer speaks v1, so
// those subjects arrive here and leave as v2 records through the app's own
// converter. This is test scaffolding: no product or harness path converts on
// the way in.
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { convertBaselineRecord } from '../../baseline/fixturesV2.js'

export function toShowRecordV2(show: ShowRecord, label = show.id): ShowRecordV2 {
  return convertBaselineRecord(show, label)
}
