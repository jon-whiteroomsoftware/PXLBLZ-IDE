import { expect, it } from 'vitest'
import { recoveryFixture } from '../test/showV2RecoveryFixture'
import { captureShowStageEditV2, prepareShowStageFromCapturedInputsV2, prepareShowStageV2 } from './showPreparedStageV2'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { editShowLayerV2 } from './showLayersV2'
import { createCustomMap } from './maps'
it('qualifies immutable edit inputs independently of current source-dependent preparation', () => {
  const { record, dependencies } = recoveryFixture()
  const capture = captureShowStageEditV2(record, dependencies)
  expect(capture.prepared.status).toBe('refused')
  expect(capture.inputCapture.status).toBe('qualified')
  if (capture.inputCapture.status !== 'qualified') throw Error('Capture invalid')
  const { inputs } = capture.inputCapture
  expect(inputs.identity).toEqual({ record, dependencies })
  expect(inputs.record).not.toBe(record)
  expect(Object.isFrozen(inputs.record.composition)).toBe(true)
  expect(Object.isFrozen(inputs.assets.patterns[0])).toBe(true)
  dependencies.patterns[0].src = 'broken'
  const edited = editShowPropertyV2(record, { kind: 'show' }, { kind: 'remove-track', trackId: 'animation' })
  expect(edited.status).toBe('changed')
  expect(prepareShowStageFromCapturedInputsV2(edited.record, inputs).status).toBe('ready')
  expect(prepareShowStageV2(edited.record, dependencies).status).toBe('refused')
})
it('existing unused Layer removal recovers exact qualified refused record', () => {
  const { record, dependencies } = recoveryFixture(false)
  const capture = captureShowStageEditV2(record, dependencies)
  expect(capture.prepared.status).toBe('refused'); expect(capture.inputCapture.status).toBe('qualified')
  if (capture.inputCapture.status !== 'qualified') throw Error('Capture invalid')
  const overlay = record.composition.layers.find(layer => layer.rank !== 0)!
  const edited = editShowLayerV2(record, { kind: 'remove', zoneId: overlay.zoneId, layerId: overlay.id })
  expect(edited.status).toBe('changed')
  expect(prepareShowStageFromCapturedInputsV2(edited.record, capture.inputCapture.inputs).status).toBe('ready')
})
it.each(['structure', 'domain', 'context'] as const)('invalid %s never qualifies recovery inputs', partition => {
  const { record, dependencies } = recoveryFixture()
  if (partition === 'structure') Object.assign(record.composition, { unknown: true })
  if (partition === 'domain') record.composition.clips[0].instanceId = 'missing'
  if (partition === 'context') dependencies.stageMap = createCustomMap([[0, 0], [1, 1]], { id: 'wrong', name: 'Wrong' })
  expect(captureShowStageEditV2(record, dependencies)).toMatchObject({ prepared: { status: 'refused' }, inputCapture: { status: 'invalid' } })
})
it('missing source remains qualified input but fully refused if still needed after edit', () => {
  const { record, dependencies } = recoveryFixture(); dependencies.patterns = []
  const capture = captureShowStageEditV2(record, dependencies)
  expect(capture.inputCapture.status).toBe('qualified')
  if (capture.inputCapture.status !== 'qualified') throw Error('Capture invalid')
  const edited = editShowPropertyV2(record, { kind: 'show' }, { kind: 'remove-track', trackId: 'animation' })
  expect(prepareShowStageFromCapturedInputsV2(edited.record, capture.inputCapture.inputs).status).toBe('refused')
})
it('invalid actual resolver context does not qualify even when source preparation also refuses', () => {
  const { record, dependencies } = recoveryFixture()
  record.stageMapId = 'stage'
  dependencies.stageMap = { ...createCustomMap([[0, 0], [1, 1]], { id: 'stage', name: 'Stage' }), resolve: () => { throw Error('Invalid map geometry') } }
  expect(captureShowStageEditV2(record, dependencies)).toMatchObject({ prepared: { status: 'refused' }, inputCapture: { status: 'invalid', message: 'Invalid map geometry' } })
})
