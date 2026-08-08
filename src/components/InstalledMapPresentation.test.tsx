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

  // The panel variant (#757). In a 352px popover the spelled-out count is 95px of
  // unshrinkable width that the *name* needs, and it duplicates the `pixel count` row a
  // band below — so it earns its place only when the two disagree, which is the #204
  // silent-drop trap.
  describe('mismatch count mode', () => {
    const present = { kind: 'present', name: 'Square', dimension: 2, pointCount: 256 } as const

    it('spends no width on the count while it agrees with the pixel count', () => {
      render(
        <InstalledMapPresentation presentation={present} count={{ mode: 'mismatch', pixelCount: 256 }} />,
      )

      const value = screen.getByTestId('installed-map-presentation')
      expect(value).toHaveTextContent('Square2D')
      expect(value).not.toHaveTextContent('points')
      expect(screen.queryByTestId('installed-map-count-mismatch')).not.toBeInTheDocument()
    })

    it('raises an amber chip naming both counts when they disagree', () => {
      render(
        <InstalledMapPresentation presentation={present} count={{ mode: 'mismatch', pixelCount: 300 }} />,
      )

      const chip = screen.getByTestId('installed-map-count-mismatch')
      expect(chip).toHaveTextContent('256≠300')
      expect(chip).toHaveAccessibleName('Map has 256 points but the Controller has 300 pixels')
      expect(chip.className).toContain('text-amber-400')
      // The name goes amber with it: the chip explains a warning the whole row carries.
      expect(screen.getByTitle('Square').className).toContain('text-amber-400')
      expect(screen.getByTestId('installed-map-presentation')).not.toHaveTextContent('points')
    })

    it('treats an unread pixel count as no conflict rather than a disagreement', () => {
      render(
        <InstalledMapPresentation presentation={present} count={{ mode: 'mismatch', pixelCount: null }} />,
      )

      expect(screen.queryByTestId('installed-map-count-mismatch')).not.toBeInTheDocument()
      expect(screen.getByTitle('Square').className).not.toContain('text-amber-400')
    })

    it('still reduces to the shared state copy with no count at all', () => {
      render(
        <InstalledMapPresentation
          presentation={{ kind: 'state', label: 'No installed map' }}
          count={{ mode: 'mismatch', pixelCount: 300 }}
        />,
      )

      expect(screen.getByText('No installed map')).toBeInTheDocument()
      expect(screen.queryByTestId('installed-map-count-mismatch')).not.toBeInTheDocument()
    })
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
