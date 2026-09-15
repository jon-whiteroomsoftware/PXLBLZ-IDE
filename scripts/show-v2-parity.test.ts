import { describe, expect, it } from 'vitest'
import { semanticSampleTimes } from './show-v2-parity'
import { convertShowRecordV1ToV2 } from '../src/engine/showRecordV1ToV2'
import { continuingV1Show } from '../src/test/showV2TracerFixture'

describe('semanticSampleTimes', () => {
  it('samples source and v2 semantic boundaries, neighbors, and interval interiors without treating Markers as behavior', () => {
    const source = continuingV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return

    const record = structuredClone(converted.record)
    const clip = record.composition.clips[0]
    clip.appearance.keys.push({
      id: 'appearance-change',
      timeMs: 400,
      value: structuredClone(clip.appearance.keys[0].value),
    })
    record.composition.layoutOccurrences[0] = {
      ...record.composition.layoutOccurrences[0],
      startMs: 100,
      durationMs: 800,
    }
    record.composition.propertyTracks.push({
      id: 'track',
      target: { kind: 'show-repeat-scale' },
      activeStartMs: 200,
      activeDurationMs: 400,
      keyframes: [
        { id: 'key-a', timeMs: 250, value: 1, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 450, value: 2, easing: { curve: 'linear' } },
      ],
    })
    record.composition.markers.push({ id: 'narrative-only', timeMs: 333, name: 'Chapter' })

    const sampled = semanticSampleTimes(source, record, [{
      id: 'compiled-window',
      kind: 'crossfade',
      startMs: 650,
      endMs: 750,
      durationMs: 100,
      scope: 'show',
      cost: 'expensive',
    }])

    expect(sampled).toEqual(expect.arrayContaining([
      99, 100, 101, 199, 200, 201, 225, 249, 250, 251, 350,
      399, 400, 401, 449, 450, 451, 499, 500, 501, 525, 599, 600,
      601, 649, 650, 651, 700, 749, 750, 751, 899, 900, 901,
    ]))
    expect(sampled).not.toEqual(expect.arrayContaining([332, 333, 334]))
    expect(sampled).toEqual([...sampled].sort((left, right) => left - right))
  })
})
