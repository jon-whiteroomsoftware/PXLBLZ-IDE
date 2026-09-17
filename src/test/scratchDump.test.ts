import { it } from 'vitest'
import { createShowWithOutputContract } from '@/engine/showModel'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { DEMOS } from '@/pixelblaze/stock/patterns'

it('dumps', () => {
  const v1 = createShowWithOutputContract('fresh', 'Fresh', createInstallationShowOutputContract({
    outputMapId: null, pixelCount: 60,
  }), 1)
  const converted = convertShowRecordV1ToV2(v1, { byCellId: { 'cell-1': DEMOS.TestPattern1D, 'cell-2': DEMOS.CometLoom }, byPatternInstanceId: {}, stageDimension: 2 })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues, null, 1))
  console.log(JSON.stringify(converted.record, null, 1))
})
