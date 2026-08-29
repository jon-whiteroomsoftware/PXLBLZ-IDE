// Repo-owned Node floor on top of the vendored wrsp-check-node (#899): the
// Workers toolchain (wrangler 4.127.1, miniflare) requires Node >=22, so the
// vendored gate's Node 20 acceptance would pass preflight and then fail
// downstream inside wrangler. Mirrors the package.json engines range; retire
// this file when @whiteroom/software-process raises its own floor.
const requirement = '^22.13.0 || >=24'
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
const isSupported = (major === 22 && minor >= 13) || major >= 24
if (!isSupported) {
  console.error(`This repository requires Node ${requirement}; current Node is ${process.versions.node}.`)
  console.error('The Cloudflare Workers toolchain (wrangler, miniflare) requires Node >= 22.')
  process.exit(1)
}
