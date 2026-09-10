import { useLayoutEffect, useState } from 'react'
import { useShowControllerDeliveryStore, type ShowControllerDelivery } from '@/store/showControllerDeliveryStore'

/** Publish only committed editor state; departure retires this editor's capability. */
export function useShowControllerDelivery(delivery: ShowControllerDelivery | null) {
  const [owner] = useState(() => Symbol('Show Controller delivery'))
  useLayoutEffect(() => {
    const store = useShowControllerDeliveryStore.getState()
    if (delivery) store.publish(owner, delivery)
    else store.retire(owner)
  }, [delivery, owner])
  useLayoutEffect(() => () => { useShowControllerDeliveryStore.getState().retire(owner) }, [owner])
}
