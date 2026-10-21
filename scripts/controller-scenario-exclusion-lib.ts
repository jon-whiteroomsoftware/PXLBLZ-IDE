export const CONTROLLER_SCENARIO_NEEDLES = [
  'pxlblz-dev-controller-scenario-v1',
  '__pxlblzControllerScenario',
  'controllerScenario',
  'ScenarioControllerProvider',
  '[controller scenario]',
] as const

export interface BundleFile { path: string; text: string }
export interface NeedleHit { path: string; needle: string }

/** Every (file, needle) pair where the file text contains the needle. */
export function findNeedleHits(files: readonly BundleFile[], needles: readonly string[]): NeedleHit[] {
  return files.flatMap(file => needles
    .filter(needle => file.text.includes(needle))
    .map(needle => ({ path: file.path, needle })))
}

/** Text bundle files read by the recursive dist/ scan. */
export function isScannedBundleFile(path: string): boolean {
  return /\.(js|mjs|css|html|json|map|txt)$/.test(path)
}

export interface PreviewObservation {
  scenarioGlobal: string
  consoleLines: string[]
  rootRendered: boolean
}

/** Refusal reasons for a production-preview observation; empty means excluded. */
export function previewRefusals(observation: PreviewObservation): string[] {
  const refusals: string[] = []
  if (!observation.rootRendered) refusals.push('production preview did not render #root')
  if (observation.scenarioGlobal !== 'undefined') {
    refusals.push('window.__pxlblzControllerScenario is defined in production (typeof ' + observation.scenarioGlobal + ')')
  }
  for (const line of observation.consoleLines) {
    if (line.includes('[controller scenario]')) {
      refusals.push('production console logged a controller scenario line: ' + line)
    }
  }
  return refusals
}
