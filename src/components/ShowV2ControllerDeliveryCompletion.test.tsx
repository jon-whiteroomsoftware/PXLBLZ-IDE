// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { useShowControllerDeliveryStore } from '@/store/showControllerDeliveryStore'
import { useShowV2ControllerDelivery } from './useShowV2ControllerDelivery'

/**
 * The v2 editor route's Controller action row after a push settles (#1039).
 *
 * A successful push leaves a result on the Controller store. The action row
 * reads it as `succeeded` and gates both Run and Save while it stands, so the
 * v2 route has to release it exactly as the v1 editor does; otherwise one
 * successful send disables sending for the rest of the session.
 */
function Harness({ showId }: { showId: string }) {
  useShowV2ControllerDelivery({ showId, name: 'Delivery', bundle: null, artifacts: null, blockedReason: null })
  return null
}

const published = () => useShowControllerDeliveryStore.getState().delivery

beforeEach(() => {
  vi.useFakeTimers()
  useControllerStore.setState(controllerInitialState)
  useShowControllerDeliveryStore.setState({ owner: null, delivery: null })
})

afterEach(() => {
  vi.useRealTimers()
  useControllerStore.setState(controllerInitialState)
})

describe('the v2 route Controller action row', () => {
  it('releases a successful push result so a second send is offered', () => {
    const view = render(<Harness showId="delivery" />)
    act(() => {
      useControllerStore.setState({ artifactPushResult: { ok: true, created: false, artifactId: 'show:delivery', mode: 'run' } })
    })
    expect(published()?.succeeded).toBe(true)

    act(() => { vi.advanceTimersByTime(3_500) })

    expect(useControllerStore.getState().artifactPushResult).toBeNull()
    expect(published()?.succeeded).toBe(false)
    view.unmount()
  })

  it('keeps a failed push result for the notice to dismiss', () => {
    const view = render(<Harness showId="delivery" />)
    act(() => {
      useControllerStore.setState({ artifactPushResult: { ok: false, message: 'Controller refused', artifactId: 'show:delivery', mode: 'save' } })
    })
    act(() => { vi.advanceTimersByTime(10_000) })

    expect(useControllerStore.getState().artifactPushResult).not.toBeNull()
    expect(published()?.failure).toEqual({ ok: false, message: 'Controller refused', artifactId: 'show:delivery', mode: 'save' })
    view.unmount()
  })

  it('leaves the result of another artifact alone', () => {
    const view = render(<Harness showId="delivery" />)
    act(() => {
      useControllerStore.setState({ artifactPushResult: { ok: true, created: false, artifactId: 'pattern:other', mode: 'run' } })
    })
    act(() => { vi.advanceTimersByTime(10_000) })

    expect(useControllerStore.getState().artifactPushResult?.artifactId).toBe('pattern:other')
    expect(published()?.succeeded).toBe(false)
    view.unmount()
  })
})
