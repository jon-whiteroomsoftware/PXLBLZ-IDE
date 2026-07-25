import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from '@/engine/showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT } from '@/engine/showClipViewport'
import { ShowClipPlacementPad } from './ShowClipPlacementPad'
import type { ShowClipTransform, ShowClipViewport } from '@/engine/personalContentRecords'

function setup(
  transform: Partial<ShowClipTransform> = {},
  viewport: Partial<ShowClipViewport> = {},
  readOnly = false,
) {
  const onChange = vi.fn()
  render(
    <ShowClipPlacementPad
      transform={{ ...NEUTRAL_SHOW_CLIP_TRANSFORM, ...transform }}
      viewport={{ ...DEFAULT_SHOW_CLIP_VIEWPORT, ...viewport }}
      readOnly={readOnly}
      onChange={onChange}
    />,
  )
  return onChange
}

describe('aperture enablement', () => {
  it('opens the aperture on what the clip already covers', () => {
    const onChange = setup({ positionY: -0.25, scaleY: 0.5 })
    fireEvent.click(screen.getByLabelText('Aperture'))
    expect(onChange).toHaveBeenCalledWith({ viewport: expect.objectContaining({ enabled: true, height: 0.5, y: 0 }) })
  })

  it('disables without discarding the authored rectangle', () => {
    const onChange = setup({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    fireEvent.click(screen.getByLabelText('Aperture'))
    expect(onChange).toHaveBeenCalledWith({ viewport: expect.objectContaining({ enabled: false, x: 0.25, width: 0.5 }) })
  })
})

describe('editing focus', () => {
  it('offers no focus toggle until an aperture exists', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Content' })).not.toBeInTheDocument()
  })

  it('shows content handles and hides aperture handles while content has focus', () => {
    setup({}, { enabled: true, width: 0.5 })
    expect(screen.getByLabelText('Resize content nw')).toBeInTheDocument()
    expect(screen.queryByLabelText('Resize aperture nw')).not.toBeInTheDocument()
  })

  it('swaps which rectangle owns the handles', () => {
    setup({}, { enabled: true, width: 0.5 })
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(screen.getByLabelText('Resize aperture nw')).toBeInTheDocument()
    expect(screen.queryByLabelText('Resize content nw')).not.toBeInTheDocument()
  })

  it('swaps the trailing actions with focus', () => {
    setup({}, { enabled: true, width: 0.5 })
    expect(screen.getByRole('button', { name: 'Fit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(screen.getByRole('button', { name: 'Frame content' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fit' })).not.toBeInTheDocument()
  })

  it('keeps rotation with the content, since the aperture cannot turn', () => {
    setup({}, { enabled: true, width: 0.5 })
    expect(screen.getByLabelText('Rotate content')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    expect(screen.queryByLabelText('Rotate content')).not.toBeInTheDocument()
  })
})

describe('control bar actions', () => {
  it('fits the content to the aperture', () => {
    const onChange = setup({}, { enabled: true, x: 0.25, y: 0, width: 0.5, height: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    expect(onChange).toHaveBeenCalledWith({ transform: expect.objectContaining({ scaleX: 0.5, scaleY: 0.5 }) })
  })

  it('frames the aperture onto the content without touching it', () => {
    const onChange = setup({ positionX: -0.25, scaleX: 0.5, scaleY: 0.5 }, { enabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Aperture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Frame content' }))
    const patch = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(patch.viewport).toMatchObject({ x: 0, width: 0.5 })
    expect(patch.transform).toBeUndefined()
  })

  it('anchors the content inside the target rect', () => {
    const onChange = setup({ scaleX: 0.5, scaleY: 0.5 })
    fireEvent.click(screen.getByLabelText('Anchor column 3 row 3'))
    expect(onChange).toHaveBeenCalledWith({ transform: expect.objectContaining({ positionX: 0.25, positionY: 0.25 }) })
  })
})

describe('read-only', () => {
  it('disables the controls and drops the handles', () => {
    setup({}, { enabled: true, width: 0.5 }, true)
    expect(screen.getByLabelText('Aperture')).toBeDisabled()
    expect(screen.queryByLabelText('Resize content nw')).not.toBeInTheDocument()
  })
})
