import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourcePath = resolve(process.cwd(), 'src/components/ControllerPanel.tsx')
const original = readFileSync(sourcePath, 'utf8')
const healthy = 'className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center"'
const starved = 'className="grid min-w-0 max-w-[7rem] grid-cols-[2.75rem_minmax(0,1fr)] items-center"'

if (original.split(healthy).length !== 2) {
  throw new Error('#757 qualification could not find exactly one healthy ControllerFactRow layout.')
}

let child
let restored = false

function restoreSource() {
  if (restored) return
  writeFileSync(sourcePath, original)
  restored = true
}

function exitFromSignal(signal, code) {
  try {
    restoreSource()
  } catch (error) {
    console.error(`#757 qualification could not restore source after ${signal}:`, error)
  }
  child?.kill(signal)
  process.exit(code)
}

process.once('SIGINT', () => exitFromSignal('SIGINT', 130))
process.once('SIGTERM', () => exitFromSignal('SIGTERM', 143))

let result
try {
  // Recreate #757's load-bearing failure mechanism: a fixed narrow row leaves
  // the installed-map identity at zero width beside its non-shrinking metadata.
  writeFileSync(sourcePath, original.replace(healthy, starved))
  result = await new Promise((resolveResult, reject) => {
    child = spawn(
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
        env: { ...process.env, CI: '1', PXLBLZ_LAYOUT_MUTATION: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (status, signal) => resolveResult({ status, signal, stdout, stderr }))
  })
} finally {
  restoreSource()
}

if (readFileSync(sourcePath, 'utf8') !== original) {
  throw new Error('#757 qualification did not restore ControllerPanel.tsx.')
}

const output = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`
if (result?.status === 0) {
  throw new Error('#757 source mutation survived the Chromium layout contract.')
}
if (!/must-fit: installed-map-name/.test(output)) {
  throw new Error(
    `#757 source mutation failed for the wrong reason; expected the installed-map-name must-fit oracle.\n${output}`,
  )
}

console.log('#757 mutation qualification PASS: installed-map-name collapsed to 0px and the must-fit oracle rejected it.')
