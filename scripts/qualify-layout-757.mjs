import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourcePath = resolve(process.cwd(), 'src/components/ControllerPanel.tsx')
const original = readFileSync(sourcePath, 'utf8')
const healthy = 'className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center"'
const starved = 'className="grid min-w-0 max-w-[7rem] grid-cols-[2.75rem_minmax(0,1fr)] items-center"'

if (original.split(healthy).length !== 2) {
  throw new Error('#757 qualification could not find exactly one healthy ControllerFactRow layout.')
}

let result
try {
  // Recreate #757's load-bearing failure mechanism: a fixed narrow row leaves
  // the installed-map identity at zero width beside its non-shrinking metadata.
  writeFileSync(sourcePath, original.replace(healthy, starved))
  result = spawnSync(
    process.execPath,
    [
      resolve(process.cwd(), 'node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'chromium-layout',
      'src/test/layoutSurfaces.layout.test.tsx',
      '--reporter=verbose',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
      maxBuffer: 16 * 1024 * 1024,
    },
  )
} finally {
  writeFileSync(sourcePath, original)
}

if (readFileSync(sourcePath, 'utf8') !== original) {
  throw new Error('#757 qualification did not restore ControllerPanel.tsx.')
}

const output = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`
if (result?.error) throw result.error
if (result?.status === 0) {
  throw new Error('#757 source mutation survived the Chromium layout contract.')
}
if (!/must-fit: installed-map-name/.test(output)) {
  throw new Error(
    `#757 source mutation failed for the wrong reason; expected the installed-map-name must-fit oracle.\n${output}`,
  )
}

console.log('#757 mutation qualification PASS: installed-map-name collapsed to 0px and the must-fit oracle rejected it.')
