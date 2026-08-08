import { describe, expect, it } from 'vitest'
import {
  assertLayoutCanaryReport,
  formatLayoutCanaryReport,
  runLayoutCanary,
} from '@whiteroom/software-process/layout-canary'

describe('packaged layout gate canary', () => {
  it('proves the configured runner supplies real browser geometry', () => {
    const report = runLayoutCanary()

    console.log(formatLayoutCanaryReport(report))
    expect(assertLayoutCanaryReport(report)).toBe(report)
  })
})
