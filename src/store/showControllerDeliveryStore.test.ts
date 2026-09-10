import { useShowControllerDeliveryStore, type ShowControllerDelivery } from './showControllerDeliveryStore'

it('keeps the replacement editor capability when the old owner retires', async () => {
  const oldOwner = Symbol('old editor')
  const newOwner = Symbol('new editor')
  const oldRequest = vi.fn()
  const newRequest = vi.fn()
  const delivery: ShowControllerDelivery = {
    subject: { kind: 'show', id: 'same-show', name: 'Show', deliveryBlocker: null, runAlreadyPushed: false, saveAlreadyPushed: false },
    mode: 'run', pushing: false, succeeded: false, failure: null, dismissFailure: () => {}, pending: false, warnings: [], blocked: false,
    request: oldRequest, confirm: async () => {}, cancel: () => {},
  }
  const store = useShowControllerDeliveryStore.getState()
  store.publish(oldOwner, delivery)
  store.publish(newOwner, { ...delivery, request: newRequest })
  store.retire(oldOwner)
  useShowControllerDeliveryStore.getState().delivery?.request('run')
  expect(oldRequest).not.toHaveBeenCalled()
  expect(newRequest).toHaveBeenCalledExactlyOnceWith('run')
  store.retire(newOwner)
  expect(useShowControllerDeliveryStore.getState().delivery).toBeNull()
})
