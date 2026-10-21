import { expect, it } from 'vitest'
import { keyframeNodeRefusal } from './gallery-keyframes-node'

it('accepts matching Node majors with whitespace, a v prefix, or a pinned minor', () => {
  expect(keyframeNodeRefusal('22\n', '22.23.3')).toBeNull()
  expect(keyframeNodeRefusal('v22', '22.0.0')).toBeNull()
  expect(keyframeNodeRefusal('22.13.0', '22.23.3')).toBeNull()
})

it('refuses a different whole Node major with instructions to use the pinned version', () => {
  expect(keyframeNodeRefusal('22', '24.14.0')).toBe(
    "gallery:keyframes: needs Node 22 (pinned in .node-version); this is Node 24.14.0. Run `fnm use` or `nvm use 22`, then retry. Keyframe snapshots depend on the engine's Math functions, so another major writes different bytes (#1174).",
  )
  expect(keyframeNodeRefusal('22', '2.0.0')).not.toBeNull()
})

it('refuses a pin that does not start with a Node major version', () => {
  expect(keyframeNodeRefusal('', '22.1.0')).toBe(
    'gallery:keyframes: .node-version must start with a Node major version (found "")',
  )
  expect(keyframeNodeRefusal('lts/*', '22.1.0')).toBe(
    'gallery:keyframes: .node-version must start with a Node major version (found "lts/*")',
  )
})
