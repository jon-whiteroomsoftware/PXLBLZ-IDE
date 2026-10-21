export function keyframeNodeRefusal(pinned: string, running: string): string | null {
  const pinnedMajor = pinned.trim().replace(/^v/, '').match(/^\d+/)?.[0]
  if (!pinnedMajor) {
    return `gallery:keyframes: .node-version must start with a Node major version (found "${pinned.trim()}")`
  }
  const runningMajor = running.match(/^\d+/)?.[0]
  if (pinnedMajor === runningMajor) return null
  return `gallery:keyframes: needs Node ${pinnedMajor} (pinned in .node-version); this is Node ${running}. Run \`fnm use\` or \`nvm use ${pinnedMajor}\`, then retry. Keyframe snapshots depend on the engine's Math functions, so another major writes different bytes (#1174).`
}
