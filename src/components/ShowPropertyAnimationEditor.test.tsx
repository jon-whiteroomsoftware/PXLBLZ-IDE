import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ShowPropertyAnimationTrack } from '@/engine/personalContentRecords'
import type { ShowPropertyAnimationOption } from '@/engine/showPropertyAnimationEditorModel'
import type { EditRefusal } from './ui/edit-refusal-line'
import {
  ShowPropertyAnimationAction,
  ShowPropertyAnimationOverview,
  ShowPropertyAnimationProvider,
} from './ShowPropertyAnimationEditor'

const brightness: ShowPropertyAnimationOption = {
  key: 'placement-view:placement-1:brightness',
  label: 'Brightness',
  target: { kind: 'placement-view', placementId: 'placement-1', property: 'brightness' },
  value: 0.8,
  min: 0,
  max: 1,
  step: 0.01,
  presentation: 'percentage',
}

const track: ShowPropertyAnimationTrack = {
  id: 'track-brightness',
  target: brightness.target,
  keyframes: [
    { id: 'from', timeMs: 0, value: 0.8, easing: { curve: 'linear' } },
    { id: 'to', timeMs: 4_000, value: 0.2, easing: { curve: 'linear' } },
  ],
}

function editor(
  tracks: ShowPropertyAnimationTrack[],
  onChange = vi.fn(),
  instanceUseCount = 1,
) {
  return {
    onChange,
    view: render(
      <ShowPropertyAnimationProvider
        options={[brightness]}
        tracks={tracks}
        storageDurationMs={4_000}
        showTimeOffsetMs={12_000}
        instanceUseCount={instanceUseCount}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={brightness.target} />
      </ShowPropertyAnimationProvider>,
    ),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function changeFrom(value: string) {
  const from = screen.getByRole('textbox', { name: 'Brightness animation from exact percentage' })
  fireEvent.change(from, { target: { value } })
  fireEvent.keyDown(from, { key: 'Enter' })
  return from
}

describe('per-parameter Property animation editor (#648)', () => {
  it('shows one structured refusal, blocks duplicate mutations, and retries (#1209)', async () => {
    const first = deferred<boolean | EditRefusal>()
    const onChange = vi.fn().mockReturnValueOnce(first.promise).mockReturnValue(true)
    editor([], onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    const from = changeFrom('20')
    expect(from).toBeDisabled()
    fireEvent.keyDown(from, { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('Brightness animation easing'), { target: { value: 'ease-in' } })
    expect(onChange).toHaveBeenCalledOnce()
    await act(async () => { first.resolve({ refused: true, message: 'This edit is unavailable.' }) })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('This edit is unavailable.')
    expect(from).toBeEnabled()
    changeFrom('30')
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('consumes a new draft only after accepted settlement (#1209)', async () => {
    const result = deferred<boolean>()
    const onChange = vi.fn().mockReturnValue(result.promise)
    editor([], onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    changeFrom('20')
    await act(async () => { result.resolve(true) })
    changeFrom('30')
    expect(onChange).toHaveBeenCalledOnce()
  })

  it.each(['false', 'structured', 'rejection', 'throw'] as const)('restores an existing controlled key on %s (#1209)', async kind => {
    const result = deferred<boolean | EditRefusal>()
    const onChange = vi.fn(() => { if (kind === 'throw') throw new Error('failure'); return result.promise })
    editor([track], onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Brightness animation' }))
    const from = changeFrom('20')
    await act(async () => {
      if (kind === 'rejection') result.reject(new Error('failure'))
      else result.resolve(kind === 'structured' ? { refused: true, message: 'Refused key' } : false)
    })
    expect(from).toHaveValue('80')
    expect(from).toBeEnabled()
    if (kind === 'structured') expect(screen.getByRole('alert')).toHaveTextContent('Refused key')
  })

  it('keeps removal open until accepted and permits retry after refusal (#1209)', async () => {
    const result = deferred<boolean>()
    const onChange = vi.fn().mockReturnValueOnce(result.promise).mockReturnValue(true)
    editor([track], onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Brightness animation' }))
    const remove = screen.getByRole('button', { name: 'Remove Brightness animation' })
    fireEvent.click(remove)
    fireEvent.click(remove)
    expect(remove).toBeDisabled()
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { name: 'Brightness animation' })).toBeVisible()
    await act(async () => { result.resolve(false) })
    expect(screen.getByRole('dialog', { name: 'Brightness animation' })).toBeVisible()
    fireEvent.click(remove)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog', { name: 'Brightness animation' })).not.toBeInTheDocument()
  })

  it.each(['accepted', 'refused', 'rejection'] as const)('suppresses obsolete %s completion after Escape and reopening (#1209)', async kind => {
    const result = deferred<boolean | EditRefusal>()
    const onChange = vi.fn().mockReturnValue(result.promise)
    editor([track], onChange)
    const open = screen.getByRole('button', { name: 'Edit Brightness animation' })
    fireEvent.click(open)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Brightness animation' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(open)
    await act(async () => {
      if (kind === 'rejection') result.reject(new Error('late failure'))
      else result.resolve(kind === 'accepted' ? true : { refused: true, message: 'Obsolete refusal' })
    })
    expect(screen.getByRole('dialog', { name: 'Brightness animation' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores completion after provider unmount (#1209)', async () => {
    const result = deferred<boolean | EditRefusal>()
    const { view } = editor([], vi.fn().mockReturnValue(result.promise))
    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    changeFrom('20')
    view.unmount()
    await act(async () => { result.resolve({ refused: true, message: 'Late refusal' }) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('routes overview removal through the same pending owner and closes only after acceptance (#1209)', async () => {
    const refused = deferred<boolean | EditRefusal>()
    const accepted = deferred<boolean>()
    const onChange = vi.fn().mockReturnValueOnce(refused.promise).mockReturnValueOnce(accepted.promise)
    const onOverviewEmpty = vi.fn()
    render(<ShowPropertyAnimationProvider options={[brightness]} tracks={[track]} storageDurationMs={4000} showTimeOffsetMs={12000} instanceUseCount={1} onChange={onChange} onOverviewEmpty={onOverviewEmpty}>
      <ShowPropertyAnimationOverview onBack={vi.fn()} onNavigate={vi.fn()} />
    </ShowPropertyAnimationProvider>)
    const remove = screen.getByRole('button', { name: 'Remove Brightness animation' })
    fireEvent.click(remove)
    fireEvent.click(remove)
    expect(onChange).toHaveBeenCalledOnce()
    expect(remove).toBeDisabled()
    expect(onOverviewEmpty).not.toHaveBeenCalled()
    await act(async () => { refused.resolve({ refused: true, message: 'Retain track' }) })
    expect(screen.getByRole('alert')).toHaveTextContent('Retain track')
    expect(onOverviewEmpty).not.toHaveBeenCalled()
    fireEvent.click(remove)
    expect(onOverviewEmpty).not.toHaveBeenCalled()
    await act(async () => { accepted.resolve(true) })
    expect(onOverviewEmpty).toHaveBeenCalledOnce()
  })
  it('retains a new draft for retry after asynchronous refusal (#1209)', async () => {
    let settle!: (value: boolean) => void
    const onChange = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { settle = resolve })).mockReturnValue(true)
    editor([], onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    const from = screen.getByRole('textbox', { name: 'Brightness animation from exact percentage' })
    fireEvent.change(from, { target: { value: '20' } })
    fireEvent.keyDown(from, { key: 'Enter' })
    await act(async () => { settle(false) })
    fireEvent.change(from, { target: { value: '30' } })
    fireEvent.keyDown(from, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(2)
  })
  it('dismisses on an outside press even when the surrounding workspace stops pointer bubbling (#664)', () => {
    render(
      <div onPointerDown={(event) => event.stopPropagation()}>
        <ShowPropertyAnimationProvider
          options={[brightness]}
          tracks={[]}
          storageDurationMs={4_000}
          showTimeOffsetMs={12_000}
          instanceUseCount={1}
          onChange={vi.fn()}
        >
          <ShowPropertyAnimationAction target={brightness.target} />
        </ShowPropertyAnimationProvider>
        <button type="button">Timeline surface</button>
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    expect(screen.getByRole('dialog', { name: 'Brightness animation' })).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Timeline surface' }))

    expect(screen.queryByRole('dialog', { name: 'Brightness animation' })).not.toBeInTheDocument()
  })

  it('keeps a hollow animation draft transient when dismissed without a real edit', () => {
    const { onChange } = editor([])

    const diamond = screen.getByRole('button', { name: 'Animate Brightness' })
    expect(diamond).toHaveAttribute('data-animated', 'false')
    expect(diamond).toHaveClass('border-transparent', 'bg-transparent')
    expect(diamond).not.toHaveClass('border-zinc-800/80', 'bg-zinc-950/50')
    fireEvent.click(diamond)

    expect(screen.getByRole('dialog', { name: 'Brightness animation' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Brightness animation from exact percentage' })).toHaveValue('80')
    expect(screen.getByRole('textbox', { name: 'Brightness animation from time exact time' })).toHaveValue('12')
    expect(screen.getByRole('textbox', { name: 'Brightness animation to time exact time' })).toHaveValue('16')

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Brightness animation' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Brightness animation' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('layers a nested exact-value slider above the animation popover (#677)', () => {
    editor([])

    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))
    const popover = screen.getByRole('dialog', { name: 'Brightness animation' })
    const from = within(popover).getByRole('textbox', {
      name: 'Brightness animation from exact percentage',
    })
    const field = from.parentElement
    expect(field).not.toBeNull()

    fireEvent.keyDown(within(field!).getByRole('button', {
      name: 'Adjust with percentage slider',
    }), { key: 'Enter' })

    expect(popover).toHaveClass('z-[130]')
    expect(screen.getByRole('dialog', { name: 'Percentage slider controls' }))
      .toHaveClass('z-[140]')
  })

  it('commits the edited two-point draft as one semantic change', () => {
    const { onChange } = editor([])
    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))

    const from = screen.getByRole('textbox', { name: 'Brightness animation from exact percentage' })
    fireEvent.change(from, { target: { value: '60%' } })
    fireEvent.keyDown(from, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({
      kind: 'add-track',
      target: brightness.target,
      initialValue: 0.8,
      keyframes: [
        { timeMs: 0, value: 0.6, easing: { curve: 'linear' } },
        { timeMs: 4_000, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
  })

  it('tracks filled state through add/delete and edits existing global times back to local milliseconds', () => {
    const onChange = vi.fn()
    const { view } = editor([], onChange)
    expect(screen.getByRole('button', { name: 'Animate Brightness' })).toHaveAttribute('data-animated', 'false')

    view.rerender(
      <ShowPropertyAnimationProvider
        options={[brightness]}
        tracks={[track]}
        storageDurationMs={4_000}
        showTimeOffsetMs={12_000}
        instanceUseCount={1}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={brightness.target} />
      </ShowPropertyAnimationProvider>,
    )

    const filled = screen.getByRole('button', { name: 'Edit Brightness animation' })
    expect(filled).toHaveAttribute('data-animated', 'true')
    fireEvent.click(filled)
    const toTime = screen.getByRole('textbox', { name: 'Brightness animation to time exact time' })
    fireEvent.change(toTime, { target: { value: '15.5' } })
    fireEvent.keyDown(toTime, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith({
      kind: 'update-keyframe',
      trackId: 'track-brightness',
      keyframeId: 'to',
      changes: { timeMs: 3_500 },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Brightness animation' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'delete-track', trackId: 'track-brightness' })
  })

  it('discloses linked Clip ownership for an instance-owned parameter', () => {
    const speed: ShowPropertyAnimationOption = {
      key: 'instance-time-scale:instance-1',
      label: 'Animation speed',
      target: { kind: 'instance-time-scale', instanceId: 'instance-1' },
      value: 1,
      min: 0,
      max: 4,
      step: 0.01,
      presentation: 'multiplier',
    }
    render(
      <ShowPropertyAnimationProvider
        options={[speed]}
        tracks={[]}
        storageDurationMs={4_000}
        showTimeOffsetMs={0}
        instanceUseCount={4}
        onChange={vi.fn()}
      >
        <ShowPropertyAnimationAction target={speed.target} />
      </ShowPropertyAnimationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Animate Animation speed' }))
    expect(screen.getByRole('dialog', { name: 'Animation speed animation' }))
      .toHaveTextContent('Affects 4 linked Clips')
  })

  it('authors Rotation in the degrees taught by the adjacent Clip field', () => {
    const rotation: ShowPropertyAnimationOption = {
      key: 'placement-transform:placement-1:rotation',
      label: 'Rotation',
      target: { kind: 'placement-transform', placementId: 'placement-1', property: 'rotation' },
      value: 0.25,
      min: -8,
      max: 8,
      step: 1 / 360,
      presentation: 'degrees',
    }
    const onChange = vi.fn()
    render(
      <ShowPropertyAnimationProvider
        options={[rotation]}
        tracks={[]}
        storageDurationMs={4_000}
        showTimeOffsetMs={0}
        instanceUseCount={1}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={rotation.target} />
      </ShowPropertyAnimationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Animate Rotation' }))
    const from = screen.getByRole('textbox', { name: 'Rotation animation from exact rotation' })
    expect(from).toHaveValue('90')
    fireEvent.change(from, { target: { value: '180' } })
    fireEvent.keyDown(from, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'add-track',
      keyframes: [
        { timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { timeMs: 4_000, value: 0.25, easing: { curve: 'linear' } },
      ],
    }))
  })

  it('authors Phase through the shared phase contract taught by the adjacent Clip field', () => {
    const phase: ShowPropertyAnimationOption = {
      key: 'placement-view:placement-1:phase',
      label: 'Phase',
      target: { kind: 'placement-view', placementId: 'placement-1', property: 'phase' },
      value: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      presentation: 'phase',
    }
    const onChange = vi.fn()
    render(
      <ShowPropertyAnimationProvider
        options={[phase]}
        tracks={[]}
        storageDurationMs={4_000}
        showTimeOffsetMs={0}
        instanceUseCount={1}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={phase.target} />
      </ShowPropertyAnimationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Animate Phase' }))
    const from = screen.getByRole('textbox', { name: 'Phase animation from exact phase' })
    expect(from).toHaveValue('0.25')
    fireEvent.change(from, { target: { value: '0.5' } })
    fireEvent.keyDown(from, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'add-track',
      keyframes: [
        { timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { timeMs: 4_000, value: 0.25, easing: { curve: 'linear' } },
      ],
    }))
  })
})
