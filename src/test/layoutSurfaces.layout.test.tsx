import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findLayoutFaults,
  formatLayoutFaults,
} from '@whiteroom/software-process/layout-faults'
import {
  LAYOUT_SURFACE_MANIFEST,
  resetLayoutSurfaceState,
} from './layoutSurfaceManifest'

afterEach(() => {
  cleanup()
  resetLayoutSurfaceState()
  document.body.replaceChildren()
})

describe('risk-based product layout contracts', () => {
  for (const surface of LAYOUT_SURFACE_MANIFEST) {
    it(`${surface.id} has no undeclared layout faults`, async () => {
      const host = document.createElement('div')
      host.dataset.testid = `layout-surface-${surface.id}`
      host.style.width = `${surface.width}px`
      host.style.height = `${surface.height}px`
      host.style.overflow = 'hidden'
      document.body.appendChild(host)

      render(surface.render(), { container: host })
      if (surface.ready) {
        await waitFor(() => expect(surface.ready?.(host)).toBe(true))
      }
      surface.annotate?.(host)

      const faults = findLayoutFaults(host)
      expect(faults, `Layout faults in ${surface.id}:\n${formatLayoutFaults(faults)}`).toEqual([])
    })
  }
})
