import { expect } from 'vitest'
import { validateShowComposition } from '@/engine/showCompositionModel'
import type {
  ShowCompositionV1,
  ShowRecord,
} from '@/engine/personalContentRecords'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineProjection,
} from '@/engine/showUnifiedTimelineProjection'

interface ShowAuthoringEditContract {
  show: ShowRecord
  composition: ShowCompositionV1
  edit: (composition: ShowCompositionV1) => ShowCompositionV1
}

interface AcceptedShowAuthoringEditContract extends ShowAuthoringEditContract {
  assertProjection: (
    projection: ShowUnifiedTimelineProjection,
    result: ShowCompositionV1,
  ) => void
  assertReferences: (
    result: ShowCompositionV1,
    original: ShowCompositionV1,
  ) => void
}

/**
 * Assert the shared contract for an accepted pure Show authoring edit.
 *
 * The supplied callbacks keep operation-specific projection and reference
 * checks next to each test while this helper owns the universal invariants.
 */
export function expectAcceptedShowAuthoringEdit({
  show,
  composition,
  edit,
  assertProjection,
  assertReferences,
}: AcceptedShowAuthoringEditContract): ShowCompositionV1 {
  const showSnapshot = structuredClone(show)
  const compositionSnapshot = structuredClone(composition)
  expect(validateShowComposition(show, composition)).toEqual([])

  const result = edit(composition)

  expect(show).toEqual(showSnapshot)
  expect(composition).toEqual(compositionSnapshot)
  expect(result).not.toBe(composition)
  expect(validateShowComposition(show, result)).toEqual([])
  assertProjection(projectShowUnifiedTimeline(show, result), result)
  assertReferences(result, compositionSnapshot)
  return result
}

/**
 * Assert the shared contract for a refused pure Show authoring edit.
 */
export function expectRefusedShowAuthoringEdit({
  show,
  composition,
  edit,
}: ShowAuthoringEditContract): ShowCompositionV1 {
  const showSnapshot = structuredClone(show)
  const compositionSnapshot = structuredClone(composition)
  expect(validateShowComposition(show, composition)).toEqual([])

  const result = edit(composition)

  expect(result).toBe(composition)
  expect(show).toEqual(showSnapshot)
  expect(composition).toEqual(compositionSnapshot)
  return result
}
