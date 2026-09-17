// Compile inputs for the native v2 stock catalogue (#1040).
//
// A native record names stock Patterns and a Stage map; preparing it for the
// compiler needs their exact sources, exactly as the v1 stock path resolves
// them. Nothing here converts, normalizes or repairs a record: it only supplies
// the trusted dependency sources `prepareShowV2ForCompile` asks for.
import { stockMapSpec } from '@/engine/maps'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { materializeShowGroupsV2 } from '@/engine/showGroupsV2'
import type { ShowCompileRecipeSourceLookup } from '@/engine/showModel'
import { DEMOS, resolveStockPatternId } from './patterns'

/** The Stage dimension a native record's output contract and map imply. */
export function nativeStockStageDimensionV2(record: ShowRecordV2): 1 | 2 | 3 {
  if (record.outputContract.kind === 'portable-2d') return 2
  const map = record.stageMapId ? stockMapSpec(record.stageMapId) : undefined
  return map?.dim ?? 2
}

/**
 * Exact stock Pattern sources for every runtime a native record can
 * materialize: ordinary instances, Group definition slots and the runtimes
 * Group occurrences project. An unknown stock id throws rather than falling
 * back to a placeholder, so a catalogue typo fails loudly.
 */
export function nativeStockSourceLookupV2(record: ShowRecordV2): ShowCompileRecipeSourceLookup {
  const composition = record.composition
  const instances = [
    // Materialization resolves every Group occurrence binding to its real
    // runtime identity, so the lookup covers occurrence-owned runtimes too.
    ...(composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record).composition.patternInstances,
    ...composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ]
  const byPatternInstanceId = Object.fromEntries(instances.map(instance => {
    if (instance.pattern.kind !== 'stock') {
      throw new Error(`Native stock Show "${record.id}" references a non-stock Pattern on instance "${instance.id}".`)
    }
    const id = resolveStockPatternId(instance.pattern.id)
    if (!Object.prototype.hasOwnProperty.call(DEMOS, id)) {
      throw new Error(`Native stock Show "${record.id}" references unknown stock Pattern "${instance.pattern.id}".`)
    }
    return [instance.id, DEMOS[id]]
  }))
  return { byCellId: {}, byPatternInstanceId, stageDimension: nativeStockStageDimensionV2(record) }
}
