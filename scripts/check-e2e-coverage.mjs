#!/usr/bin/env node
// Every Playwright spec must be reachable from something that actually runs it.
//
// Authenticated specs are excluded from playwright.config.ts by testIgnore, so
// they run only when an npm script names them. Three of them were named by no
// script at all, including the recovery specs #626 was actively adding, and
// nothing said so: an unrun spec is indistinguishable from a passing one. See
// #638.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const repositoryRoot = new URL('..', import.meta.url).pathname
const specDirectory = join(repositoryRoot, 'e2e')

const packageScripts = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).scripts
const scriptText = Object.values(packageScripts).join('\n')

const authenticatedSpecs = readdirSync(specDirectory)
  .filter((entry) => entry.endsWith('.auth.spec.ts'))
  .sort()

const orphans = authenticatedSpecs.filter((spec) => !scriptText.includes(`e2e/${spec}`))

if (orphans.length > 0) {
  console.error('\nAuthenticated Playwright specs that no npm script runs:\n')
  for (const spec of orphans) console.error(`  e2e/${spec}`)
  console.error(`
playwright.config.ts sets testIgnore: '**/*.auth.spec.ts', so these never run
under "npm run test:e2e" either. Add each to an authenticated script such as
test:e2e:auth-smoke or test:e2e:shows, or delete it. Do not leave it in the
tree, where it reads as coverage that does not exist.
`)
  process.exit(1)
}

console.log(`All ${authenticatedSpecs.length} authenticated specs are reachable from an npm script.`)
