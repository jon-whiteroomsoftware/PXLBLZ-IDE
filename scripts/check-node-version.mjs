const requirement = '^20.19.0 || ^22.13.0 || >=24'
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)

const isSupported =
  (major === 20 && minor >= 19) ||
  (major === 22 && minor >= 13) ||
  major >= 24

if (!isSupported) {
  console.error(
    `PXLBLZ requires Node ${requirement}; current Node is ${process.versions.node}.`,
  )
  console.error('Use a supported Node runtime before running npm scripts or git hooks.')
  process.exit(1)
}
