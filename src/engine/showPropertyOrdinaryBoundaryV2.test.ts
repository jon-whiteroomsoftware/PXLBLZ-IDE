import { expect, it } from 'vitest'
import type { ShowPropertyTrackV2 } from './showCompositionV2'
import { evaluateShowPropertyKeysV2, insertTimeInPropertyTracksV2, restrictShowPropertyTrackV2 } from './showPropertyTrackTimeMappingV2'
import { emitShowPropertyTrackExpression, evaluateShowPropertyTrack } from './showPropertyAnimation'

function track(curve: 'steps' | 'hold'): ShowPropertyTrackV2 {
  return { id: 'ordinary', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
    { id: 'first', timeMs: 0, value: .1, easing: { curve: 'linear' } },
    { id: 'middle', timeMs: 250, value: .2, easing: curve === 'steps' ? { curve: 'steps', steps: 4, position: 'start' } : { curve: 'hold', at: 0 } },
    { id: 'last', timeMs: 500, value: 1, easing: { curve: 'linear' } },
  ] }
}
function delivered(source: ShowPropertyTrackV2, atMs: number) {
  const compiler = { ...source, target: { kind: 'placement-opacity' as const, placementId: 'clip' } }
  const expression = emitShowPropertyTrackExpression(compiler, 'atMs')
  return [evaluateShowPropertyKeysV2(source.keyframes, atMs), evaluateShowPropertyTrack(compiler, atMs), new Function('atMs', 'min', 'max', 'floor', `return ${expression}`)(atMs, Math.min, Math.max, Math.floor)]
}
it.each(['steps', 'hold'] as const)('preserves ordinary %s historical outgoing exact boundary', curve => {
  const original = track(curve)
  for (const value of delivered(original, 250)) expect(value).toBe(curve === 'steps' ? .4 : 1)
})
it.each(['steps', 'hold'] as const)('holds ordinary %s original boundary without changing incoming or resume', curve => {
  const original = track(curve); const before = structuredClone(original)
  const mapped = insertTimeInPropertyTracksV2([original], 1000, 250, 125).propertyTracks[0]
  const boundary = curve === 'steps' ? .4 : 1
  for (const [at, expected] of [[249, .1996], [250, boundary], [251, boundary], [374, boundary], [375, boundary], [376, boundary]])
    for (const value of delivered(mapped, at)) expect(value).toBeCloseTo(expected, 12)
  expect(mapped.keyframes.find(key => key.id === 'middle')).toEqual({ ...before.keyframes[1], timeMs: 375 })
  expect(original).toEqual(before)
})
it.each((['steps', 'hold'] as const).flatMap(curve => [450,900].map(endMs => ({curve,endMs}))))('restriction preserves original $curve boundary becoming first with end$endMs', ({curve,endMs}) => {
  const original = track(curve)
  const restricted = restrictShowPropertyTrackV2([original], original, 250, endMs)!
  for (const value of delivered(restricted, 250)) expect(value).toBe(curve === 'steps' ? .4 : 1)
  expect(restricted.keyframes[0].id).toBe('middle')
})
it.each([10, 25] as const)('preserves original first endpoint when hold at%s adds an earlier carrier', atMs => {
  const original = track('steps'); original.keyframes = [
    { id: 'first', timeMs: 25, value: .2, easing: { curve: 'steps', steps: 4, position: 'start' } },
    { id: 'last', timeMs: 500, value: 1, easing: { curve: 'linear' } },
  ]
  const mapped = insertTimeInPropertyTracksV2([original], 1000, atMs, 75).propertyTracks[0]
  for (const [at, expected] of [[99, .2], [100, .2], [101, .4]]) for (const value of delivered(mapped, at)) expect(value).toBeCloseTo(expected, 12)
  expect(mapped.keyframes.find(key => key.id === 'first')?.id).toBe('first')
})
it.each(['steps', 'hold'] as const)('repeated %s holds and restrictions keep original discontinuity', curve => {
  const original = track(curve)
  const once = insertTimeInPropertyTracksV2([original], 1000, 250, 125).propertyTracks[0]
  const twice = insertTimeInPropertyTracksV2([once], 1125, 300, 50).propertyTracks[0]
  const third = insertTimeInPropertyTracksV2([twice], 1175, 425, 25).propertyTracks[0]
  const restricted = restrictShowPropertyTrackV2([third], third, 225, 650)!
  const again = restrictShowPropertyTrackV2([restricted], restricted, 250, 600)!
  const boundary = curve === 'steps' ? .4 : 1
  for (const atMs of [250,251,299,300,349,350,424,425,449,450,451])
    for (const value of delivered(again, atMs)) expect(value).toBeCloseTo(boundary, 12)
  expect(third.keyframes.find(key => key.id === 'middle')).toEqual({ ...original.keyframes[1], timeMs: 450 })
})
it('restriction before an ordinary first key preserves its original endpoint guard', () => {
  const original = track('steps'); original.keyframes = [
    { id: 'first', timeMs: 200, value: .2, easing: { curve: 'steps', steps: 4, position: 'start' } },
    { id: 'last', timeMs: 800, value: 1, easing: { curve: 'linear' } },
  ]
  const restricted = restrictShowPropertyTrackV2([original], original, 100, 900)!
  for (const [atMs, expected] of [[199,.2],[200,.2],[201,.4]])
    for (const value of delivered(restricted,atMs)) expect(value).toBeCloseTo(expected,12)
})
it('retained incoming discontinuity survives an unequal ordinary exact-key hold', () => {
  const original=track('steps'); original.keyframes[0].curveSegment={baseValue:.1,deltaValue:.1,easing:{curve:'quadratic',direction:'in'},sourceDurationMs:250,elapsedOffsetMs:0}
  const mapped=insertTimeInPropertyTracksV2([original],1000,250,125).propertyTracks[0]
  for(const value of delivered(mapped,249))expect(value).toBeCloseTo(.1+.1*(249/250)**2,12)
  for(const atMs of [250,251,374,375,376])for(const value of delivered(mapped,atMs))expect(value).toBe(.4)
  expect(mapped.keyframes[0].curveSegment).toEqual(original.keyframes[0].curveSegment)
})
it('holding strictly inside an ordinary stepped kernel retains its earlier exact boundary',()=>{
  const original=track('steps')
  const mapped=insertTimeInPropertyTracksV2([original],1000,375,50).propertyTracks[0]
  for(const [atMs,expected] of [[249,.1996],[250,.4],[251,.4],[374,.6],[375,.8],[424,.8],[425,.8],[426,.8]])
    for(const value of delivered(mapped,atMs))expect(value).toBeCloseTo(expected,12)
})
it('restriction final endpoint preserves the original ordinary discontinuous value',()=>{
  const original=track('steps');const restricted=restrictShowPropertyTrackV2([original],original,100,250)!
  for(const value of delivered(restricted,249))expect(value).toBeCloseTo(.1996,12)
  for(const value of delivered(restricted,250))expect(value).toBe(.4)
})

it('restriction preserves earlier ordinary boundary while retaining its outgoing kernel',()=>{
  const original=track('steps');const restricted=restrictShowPropertyTrackV2([original],original,100,450)!
  for(const [atMs,expected] of [[249,.1996],[250,.4],[251,.4],[374,.6],[375,.8]])
    for(const value of delivered(restricted,atMs))expect(value).toBeCloseTo(expected,12)
})
