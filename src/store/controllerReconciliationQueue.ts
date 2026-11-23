import {
  sameReconciliationTarget,
  type ReconciliationRequest,
  type ReconciliationTarget,
} from '@/engine/controllerReconciliationPolicy'

interface ProfileFlight {
  request: ReconciliationRequest
  done: Promise<void>
  next?: { request: ReconciliationRequest; done: Promise<void> }
}

interface ControllerLease {
  target: ReconciliationTarget
  released: Promise<void>
  protectedBindings: Set<string>
  release: () => void
}

const priority = { background: 0, automatic: 1, manual: 2 } as const

function targetsOverlap(left: ReconciliationTarget, right: ReconciliationTarget): boolean {
  return left.ip === right.ip || sameReconciliationTarget(left, right)
}

/** Profile flights order requests before the first profile read. Controller
 * leases extend that ordering to multiple profiles reaching the same target. */
export class ControllerReconciliationQueue {
  private flights = new Map<string, ProfileFlight>()
  private leases = new Set<ControllerLease>()
  private foregroundSaves = new Set<{ target: ReconciliationTarget; binding: string }>()

  busy(profileId: string): boolean {
    return this.flights.has(profileId)
  }

  request(
    profileId: string,
    request: ReconciliationRequest,
    run: (request: ReconciliationRequest, followUp: boolean) => Promise<void>,
  ): Promise<void> {
    const start = (request: ReconciliationRequest, followUp: boolean): Promise<void> => {
      const flight: ProfileFlight = {
        request,
        done: Promise.resolve().then(() => run(request, followUp)).finally(() => {
          if (!flight.next && this.flights.get(profileId) === flight) this.flights.delete(profileId)
        }),
      }
      this.flights.set(profileId, flight)
      return flight.done
    }

    const active = this.flights.get(profileId)
    if (!active) return start(request, false)
    if (active.request.kind === 'manual' && request.kind === 'manual') return active.done
    if (active.next) {
      if (priority[request.kind] >= priority[active.next.request.kind]) active.next.request = request
      return active.next.done
    }

    const next: NonNullable<ProfileFlight['next']> = {
      request,
      done: active.done.catch(() => undefined).then(() => {
        if (this.flights.get(profileId) === active) return start(next.request, true)
      }),
    }
    active.next = next
    return next.done
  }

  claim(target: ReconciliationTarget): { wait: Promise<void> } | { lease: ControllerLease } {
    for (const lease of this.leases) {
      if (targetsOverlap(lease.target, target)) return { wait: lease.released }
    }

    let finish!: () => void
    const lease: ControllerLease = {
      target,
      released: new Promise<void>((resolve) => { finish = resolve }),
      protectedBindings: new Set(),
      release: () => {
        this.leases.delete(lease)
        finish()
      },
    }
    for (const save of this.foregroundSaves) {
      if (targetsOverlap(save.target, target)) lease.protectedBindings.add(save.binding)
    }
    this.leases.add(lease)
    return { lease }
  }

  beginForegroundSave(target: ReconciliationTarget, binding: string): () => void {
    const save = { target, binding }
    this.foregroundSaves.add(save)
    for (const lease of this.leases) {
      if (targetsOverlap(lease.target, target)) lease.protectedBindings.add(binding)
    }
    return () => { this.foregroundSaves.delete(save) }
  }

  /** Test-only, once the test's work has settled. */
  reset(): void {
    this.flights.clear()
    this.leases.clear()
    this.foregroundSaves.clear()
  }
}
