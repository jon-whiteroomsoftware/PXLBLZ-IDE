// Emulator benchmark CLI (#247). Times a named demo in both Fast and Precise
// modes and prints mean frame time + a pixel checksum, for a tight
// measure-edit-measure optimization loop.
//
//   npm run bench -- Kishimisu
//   npm run bench -- Kishimisu --frames 60 --grid 32x32
//   npm run bench -- --list
//
// The checksum is the guard rail: re-run after an edit and compare it (per mode)
// to the previous run. Same checksum ⇒ the visual is byte-for-byte unchanged.
// See benchCore.ts for the load-bearing caveat (this counts OPS, not native
// hardware cost — that's the separate profiler.ts → costs.md).

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { benchDemo, type BenchResult, type GridSpec, type BenchOptions } from './benchCore'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEMOS_DIR = join(HERE, '../../src/pixelblaze/demos')
const LIB_DIR = join(HERE, '../../src/pixelblaze/lib')

/** Load the Pixelblaze library namespaces off disk, mirroring src/pixelblaze/
 *  libs.ts (which uses Vite's import.meta.glob, unavailable under tsx). The
 *  filename (sans .js) is the namespace, e.g. Color.js -> `Color`. */
function loadLibraries(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(LIB_DIR)) {
    if (file.endsWith('.js')) {
      out[file.replace(/\.js$/, '')] = readFileSync(join(LIB_DIR, file), 'utf8')
    }
  }
  return out
}

/** Demo names available to bench (the .js files under demos/, sans extension). */
function listDemos(): string[] {
  return readdirSync(DEMOS_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''))
    .sort()
}

function parseGrid(s: string): GridSpec {
  const parts = s.split('x').map((p) => parseInt(p, 10))
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some((n) => !Number.isFinite(n) || n < 1)
  ) {
    throw new Error(`bad --grid "${s}" (use ROWSxCOLS or ROWSxCOLSxLAYERS)`)
  }
  const [rows, cols, layers] = parts
  return { rows, cols, layers }
}

interface Args {
  demo?: string
  list: boolean
  options: BenchOptions
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, options: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--list') args.list = true
    else if (a === '--frames') args.options.frames = parseInt(argv[++i], 10)
    else if (a === '--warmup') args.options.warmup = parseInt(argv[++i], 10)
    else if (a === '--grid') args.options.grid = parseGrid(argv[++i])
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`)
    else args.demo = a
  }
  return args
}

function fmtRow(r: BenchResult): string {
  const mode = r.mode.padEnd(7)
  return `  ${mode}  ${r.meanFrameMs.toFixed(3).padStart(8)} ms/frame   checksum ${r.checksum}`
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))

  if (args.list || !args.demo) {
    if (!args.demo && !args.list) console.log('Usage: npm run bench -- <DemoName> [--frames N] [--grid RxC]\n')
    console.log('Available demos:')
    for (const name of listDemos()) console.log(`  ${name}`)
    return
  }

  const demoPath = join(DEMOS_DIR, `${args.demo}.js`)
  let src: string
  try {
    src = readFileSync(demoPath, 'utf8')
  } catch {
    console.error(`No demo "${args.demo}" (looked in ${demoPath}).`)
    console.error('Run `npm run bench -- --list` to see available demos.')
    process.exit(1)
    return
  }

  const libraries = loadLibraries()
  const { fast, precise } = benchDemo(src, libraries, args.options)

  const dimLabel = { 1: '1D', 2: '2D', 3: '3D' }[fast.dimension]
  const grid =
    fast.dimension === 3
      ? `${fast.grid.cols}x${fast.grid.rows}x${fast.grid.layers ?? fast.grid.rows}`
      : `${fast.grid.cols}x${fast.grid.rows}`
  console.log(
    `\n${args.demo}  (${dimLabel}, ${grid} = ${fast.pixelCount} px, ${fast.frames} frames)`,
  )
  console.log(fmtRow(fast))
  console.log(fmtRow(precise))
  console.log(
    `  ratio    ${(precise.meanFrameMs / fast.meanFrameMs).toFixed(1).padStart(8)} x   (precise / fast)\n`,
  )
}

main()
