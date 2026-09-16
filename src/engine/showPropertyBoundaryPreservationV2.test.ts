import { expect, it } from 'vitest'
import { evaluateShowPropertyKeysV2, insertTimeInPropertyTracksV2, restrictShowPropertyTrackV2 } from './showPropertyTrackTimeMappingV2'
import { emitShowPropertyTrackExpression, evaluateShowPropertyTrack } from './showPropertyAnimation'
import type { ShowPropertyTrackV2 } from './showCompositionV2'
function track(): ShowPropertyTrackV2 {
  return { id: 'curve', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 600, keyframes: [{ id: 'first', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'before', timeMs: 100, value: 0.5, easing: { curve: 'linear' } }, { id: 'boundary', timeMs: 200, value: 0.5, easing: { curve: 'linear' }, curveSegment: { baseValue: 0.1, deltaValue: 0.8, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 2000, elapsedOffsetMs: 500 } }, { id: 'last', timeMs: 400, value: 0.7, easing: { curve: 'linear' } }] }
}
function values(source: ShowPropertyTrackV2, times: number[]) {
  const compilerTrack = { ...source, target: { kind: 'placement-view' as const, placementId: 'clip', property: 'brightness' as const } }
  const expression = emitShowPropertyTrackExpression(compilerTrack, 'atMs'); const emitted = new Function('atMs', 'min', 'max', `return ${expression}`)
  return times.map(time => ({ native: evaluateShowPropertyKeysV2(source.keyframes, time), legacy: evaluateShowPropertyTrack(compilerTrack, time), emitted: emitted(time, Math.min, Math.max) }))
}
it('authored exact interior key wins while outgoing descriptor keeps strict interior', () => {
  const samples = values(track(), [199, 200, 201])
  for (const [index, expected] of [0.5, 0.5, 0.1502002].entries()) for (const value of Object.values(samples[index])) expect(value).toBeCloseTo(expected, 12)
})
it('hold keeps the original incoming segment, constant authored boundary and untouched shifted resume', () => {
  const original = track(); const before = structuredClone(original)
  const result = insertTimeInPropertyTracksV2([original], 600, 200, 100); expect(result.status).toBe('changed')
  const mapped = result.propertyTracks[0]
  const samples = values(mapped, [199, 200, 201, 250, 299, 300, 301])
  for (const [index, expected] of [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.1502002].entries()) for (const value of Object.values(samples[index])) expect(value).toBeCloseTo(expected, 12)
  expect(mapped.keyframes.find(key => key.id === 'boundary')).toEqual({ ...before.keyframes[2], timeMs: 300 }); expect(original).toEqual(before)
})
it('descriptor-free emitted expression bytes remain exact', () => {
  const source = { id: 'ordinary', target: { kind: 'placement-opacity' as const, placementId: 'clip' }, keyframes: [{ id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'linear' as const } }, { id: 'b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' as const } }] }
  expect(emitShowPropertyTrackExpression(source, 'atMs')).toBe('((atMs) <= 0 ? 0.2 : ((atMs) < 1000 ? (0.2 + (0.6000000000000001) * ((atMs) - 0) / 1000) : 0.8))')
})
it.each([0, 25, 100, 200, 400])('holds first/interior/last authored key at%s with incoming retained discontinuity intact', atMs => {
  const original = track(); original.activeStartMs = 0
  original.keyframes[0].timeMs = 25
  original.keyframes[0].curveSegment = { baseValue: 0.3, deltaValue: 0.2, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 100 }
  original.keyframes[1].curveSegment = { baseValue: 0.2, deltaValue: 0.3, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 1000, elapsedOffsetMs: 250 }
  const mapped = insertTimeInPropertyTracksV2([original], 600, atMs, 75).propertyTracks[0]
  for (const probe of [24, 25, 26, 99, 100, 101, 199, 200, 201, 399, 400, 401, atMs - 1, atMs, atMs + 1, atMs + 74, atMs + 75, atMs + 76]) {
    if (probe < 0) continue
    const sourceTime = probe < atMs ? probe : probe < atMs + 75 ? atMs : probe - 75
    const expected = evaluateShowPropertyKeysV2(original.keyframes, sourceTime)
    for (const delivered of Object.values(values(mapped, [probe])[0])) expect(delivered).toBeCloseTo(expected, 12)
  }
  for (const key of original.keyframes) expect(mapped.keyframes.find(candidate => candidate.id === key.id)).toEqual({ ...key, timeMs: key.timeMs >= atMs ? key.timeMs + 75 : key.timeMs })
})
it('repeated exact/inside holds and restriction retain authored discontinuities and source coefficients', () => {
  const original = track()
  const once = insertTimeInPropertyTracksV2([original], 600, 200, 100).propertyTracks[0]
  const twice = insertTimeInPropertyTracksV2([once], 700, 250, 50).propertyTracks[0]
  const third = insertTimeInPropertyTracksV2([twice], 750, 350, 25).propertyTracks[0]
  const restricted = restrictShowPropertyTrackV2([third], third, 150, 500)!
  const again = restrictShowPropertyTrackV2([restricted], restricted, 175, 450)!
  for (const probe of [175, 199, 200, 201, 249, 250, 299, 300, 349, 350, 351, 374, 375, 376, 400, 449]) {
    const expected = probe < 200 ? 0.5 : probe <= 375 ? 0.5 : 0.1 + 0.8 * ((500 + probe - 375) / 2000) ** 2
    for (const actual of Object.values(values(again, [probe])[0])) expect(actual).toBeCloseTo(expected, 12)
  }
  expect(third.keyframes.find(key => key.id === 'boundary')).toEqual({ ...original.keyframes[2], timeMs: 375 })
  expect(again.keyframes.find(key => key.id === 'boundary')).toEqual({ ...original.keyframes[2], timeMs: 375 })
})
it('ordinary exact-key hold keeps descriptor-free expression bytes identical to its authored held oracle', () => {
  const original = track(); original.keyframes = [{ id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'b', timeMs: 250, value: 0.5, easing: { curve: 'linear' } }, { id: 'c', timeMs: 500, value: 0.8, easing: { curve: 'linear' } }]
  const mapped = insertTimeInPropertyTracksV2([original], 600, 250, 125).propertyTracks[0]
  expect(mapped.keyframes.every(key => !key.curveSegment)).toBe(true)
  const compilerTarget = { kind: 'placement-view' as const, placementId: 'clip', property: 'brightness' as const }
  const independent = { ...original, target: compilerTarget, keyframes: [{ ...original.keyframes[0] }, { ...original.keyframes[1] }, { ...original.keyframes[1], id: 'manual-resume', timeMs: 375 }, { ...original.keyframes[2], timeMs: 625 }] }
  expect(emitShowPropertyTrackExpression({ ...mapped, target: compilerTarget }, 'atMs')).toBe(emitShowPropertyTrackExpression(independent, 'atMs'))
})
