import { render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MapRecord } from '@/engine/personalContentRecords'
import {
  InstalledMapPresentation,
  useInstalledMapCandidates,
} from './InstalledMapPresentation'

describe('InstalledMapPresentation', () => {
  it.each(['Reading map...', 'No installed map', 'Map unavailable', '-'] as const)(
    'renders the shared %s state copy',
    (label) => {
      render(<InstalledMapPresentation presentation={{ kind: 'state', label }} />)
      expect(screen.getByText(label)).toBeInTheDocument()
    },
  )

  it('renders name, one map-specific dimension pill, then point count', () => {
    render(<InstalledMapPresentation presentation={{
      kind: 'present',
      name: 'Square',
      dimension: 2,
      pointCount: 256,
    }} />)

    const value = screen.getByTestId('installed-map-presentation')
    expect(value).toHaveTextContent('Square2D· 256 points')
    expect(screen.getByTitle('Square')).toHaveTextContent('Square')
    expect(screen.getByLabelText('Installed map dimension: 2D')).toHaveTextContent('2D')
    expect(screen.queryByText(/verified|unverified|confidence|provenance/i)).not.toBeInTheDocument()
  })

  it('uses singular point copy', () => {
    render(<InstalledMapPresentation presentation={{
      kind: 'present',
      name: 'Index',
      dimension: 1,
      pointCount: 1,
    }} />)
    expect(screen.getByText('· 1 point')).toBeInTheDocument()
  })

  it('reuses baked candidates across unrelated rerenders', () => {
    const userMaps: MapRecord[] = []
    const { result, rerender } = renderHook(
      ({ pointCount }) => useInstalledMapCandidates(userMaps, pointCount),
      { initialProps: { pointCount: 2 } },
    )
    const first = result.current

    rerender({ pointCount: 2 })
    expect(result.current).toBe(first)

    rerender({ pointCount: 3 })
    expect(result.current).not.toBe(first)
  })
})
