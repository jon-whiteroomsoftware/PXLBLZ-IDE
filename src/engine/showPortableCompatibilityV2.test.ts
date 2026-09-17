import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { showPatternSitesV2 } from './showAuthoringValidationV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { portableCompatibilityBlockingMessage } from './showPortableCompatibility'
import {
  showPortablePatternSitesV2,
  validatePortableShowCompatibilityV2,
} from './showPortableCompatibilityV2'

const SURFACE = 'export function render2D(index, x, y) { rgb(x, y, 1) }'
const VOLUME = 'export function render3D(index, x, y, z) { rgb(x, y, z) }'
const BANDS = 'export function render(index) { rgb(index / pixelCount, 0, 0) }'

function record(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const next = converted.record
  for (const instance of next.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  return next
}

const resolve = (source: string) => (ref: { kind: string; id: string }) => (
  ref.kind === 'user' && ref.id === 'voice' ? source : undefined
)

function withGroup(next: ShowRecordV2): ShowRecordV2 {
  next.composition.groupDefinitions.push({
    id: 'group', name: 'Group', layers: [], clips: [], transitions: [], propertyTracks: [],
    patternInstances: [{ id: 'inner', pattern: { kind: 'user', id: 'voice' }, patternName: 'Inner', time: { timeScale: 1, timeOffsetMs: 0 } }],
  })
  return next
}

it('names the same authored Pattern owners the v2 authoring validator walks', () => {
  const next = withGroup(record())
  expect(showPortablePatternSitesV2(next, resolve(SURFACE)).map(site => site.cellId))
    .toEqual(showPatternSitesV2(next).map(site => site.owner))
})

it('carries the offending Pattern instance and its Clip identities', () => {
  const next = record()
  const sites = showPortablePatternSitesV2(next, resolve(VOLUME))
  expect(sites).toEqual([{
    cellId: JSON.stringify(['instance', next.composition.patternInstances[0].id]),
    instanceId: next.composition.patternInstances[0].id,
    clipIds: next.composition.clips.map(clip => clip.id),
    patternName: next.composition.patternInstances[0].patternName,
    source: VOLUME,
  }])
  const result = validatePortableShowCompatibilityV2(next, sites, 2)
  expect(result?.compatible).toBe(false)
  expect(result?.diagnostics).toEqual([{
    category: 'capability',
    code: 'portable-renderer-unsupported',
    path: JSON.stringify(['instance', next.composition.patternInstances[0].id]),
    instanceId: next.composition.patternInstances[0].id,
    clipIds: next.composition.clips.map(clip => clip.id),
    message: `${next.composition.patternInstances[0].patternName} defines only render3D.`,
  }])
  expect(portableCompatibilityBlockingMessage(result)).toContain('render3D')
})

it('accepts a 2D-capable Pattern and reports a 1D renderer as an adaptation advisory', () => {
  const next = record()
  const surface = validatePortableShowCompatibilityV2(next, showPortablePatternSitesV2(next, resolve(SURFACE)), 2)
  expect(surface).toMatchObject({ compatible: true, issues: [], advisories: [] })
  const bands = validatePortableShowCompatibilityV2(next, showPortablePatternSitesV2(next, resolve(BANDS)), 2)
  expect(bands?.compatible).toBe(true)
  expect(bands?.advisories).toEqual([
    `${next.composition.patternInstances[0].patternName} uses render; Portable adapts its normalized local position to a resolution-dependent index.`,
  ])
})

it('returns null for an Installation Show carrying the same 3D-only Pattern', () => {
  const next = record()
  next.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
  expect(validatePortableShowCompatibilityV2(next, showPortablePatternSitesV2(next, resolve(VOLUME)), 2)).toBeNull()
})

it('reads the v2 record\'s own Zone Layouts and reference dimension', () => {
  const next = record()
  next.zoneLayouts[0].logical = undefined
  const result = validatePortableShowCompatibilityV2(next, showPortablePatternSitesV2(next, resolve(SURFACE)), 3)
  expect(result?.issues).toEqual([
    'The reference output is 3D; Portable currently supports only 2D mapped surfaces.',
    `Routing layout "${next.zoneLayouts[0].name}" uses physical pixel ranges; Portable requires normalized position-based zones.`,
  ])
})

it('merges the identities of every instance sharing one offending source', () => {
  const next = record()
  const first = next.composition.patternInstances[0]
  next.composition.patternInstances.push({ ...structuredClone(first), id: 'second' })
  next.composition.clips.push({ ...structuredClone(next.composition.clips[0]), id: 'second-clip', instanceId: 'second' })
  const sites = showPortablePatternSitesV2(next, resolve(VOLUME))
  expect(sites.map(site => site.instanceId)).toEqual([first.id, 'second'])
  const result = validatePortableShowCompatibilityV2(next, sites, 2)
  expect(result?.issues).toHaveLength(1)
  expect(result?.diagnostics).toHaveLength(1)
  expect(result?.diagnostics[0].instanceId).toBe(first.id)
  expect(result?.diagnostics[0].clipIds).toEqual(['clip', 'second-clip'])
})

it('walks materialized Group runtime uses when asked for the effective scope', () => {
  const next = withGroup(record())
  const authored = showPortablePatternSitesV2(next, resolve(VOLUME))
  expect(authored.map(site => site.cellId)).toEqual([
    JSON.stringify(['instance', next.composition.patternInstances[0].id]),
    JSON.stringify(['group', 'group', 'instance', 'inner']),
  ])
  const effective = showPortablePatternSitesV2(next, resolve(VOLUME), { scope: 'effective' })
  expect(effective.map(site => site.instanceId)).toEqual([next.composition.patternInstances[0].id])
})

it('skips a site whose Pattern source is unavailable rather than substituting one', () => {
  const next = record()
  expect(showPortablePatternSitesV2(next, () => undefined)).toEqual([])
  expect(validatePortableShowCompatibilityV2(next, [], 2)).toMatchObject({ compatible: true, issues: [] })
})
