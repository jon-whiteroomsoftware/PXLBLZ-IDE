import { fetchControllerCompilerInspector } from './controllerHardware'
import { compactGeneratedShowSymbols } from '../../src/engine/showCompiler'
import { issue546Artifacts, stripPatternSlotRuntimeForDiagnostic } from './issue546'

const runHardware = process.env.ISSUE546_SYMBOLS_HARDWARE === '1'
const ip = process.env.PIXELBLAZE_IP ?? '192.168.8.224'

describe('Controller compiler symbol census for #546', () => {
  it.skipIf(!runHardware)('reads actual global addresses without changing Controller state', async () => {
    const inspect = await fetchControllerCompilerInspector(ip)
    const artifacts = issue546Artifacts['stock-show-reference-property-animation']
    const candidates = [
      { name: 'baseline-expanded', source: artifacts.baseline.expandedCode },
      { name: 'baseline-compacted', source: artifacts.baseline.code },
      { name: 'selected-expanded', source: artifacts.selected.expandedCode },
      { name: 'selected-compacted', source: artifacts.selected.code },
      {
        name: 'selected-remap-only-expanded',
        source: stripPatternSlotRuntimeForDiagnostic(artifacts.selected.expandedCode),
      },
      {
        name: 'selected-remap-only-compacted',
        source: compactGeneratedShowSymbols(
          stripPatternSlotRuntimeForDiagnostic(artifacts.selected.expandedCode),
        ).code,
      },
    ]
    const reports = candidates.map((candidate) => {
      const inspection = inspect(candidate.source)
      const typeCounts = Object.fromEntries([...new Set(inspection.identifiers.map((identifier) => identifier.type))]
        .map((type) => [type ?? 'unknown', inspection.identifiers.filter((identifier) => identifier.type === type).length]))
      const addresses = inspection.identifiers.flatMap((identifier) => (
        identifier.address == null ? [] : [identifier.address]
      ))
      return {
        name: candidate.name,
        ...inspection,
        identifiers: undefined,
        typeCounts,
        minAddress: addresses.length ? Math.min(...addresses) : null,
        maxAddress: addresses.length ? Math.max(...addresses) : null,
        uniqueAddressCount: new Set(addresses).size,
      }
    })
    console.log(JSON.stringify(reports, null, 2))
    expect(reports).toHaveLength(candidates.length)
  }, 30_000)
})
