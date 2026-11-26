import {
  sameReconciliationTarget,
  type ReconciliationRequest,
  type ReconciliationTarget,
} from '@/engine/controllerReconciliationPolicy'

interface ProfileFlight {
  active?: ReconciliationRequest
  pending?: ReconciliationRequest
  done: Promise<void>
}

interface ControllerLease {
  target: ReconciliationTarget
  released: Promise<void>
  protectedBindings: Set<string>
  release: () => void
}

export interface ControllerReconciliationRun {
  next: () => ReconciliationRequest | undefined
  claim: (target: ReconciliationTarget) => { wait: Promise<void> } | { lease: ControllerLease }
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
    run: (run: ControllerReconciliationRun) => Promise<void>,
  ): Promise<void> {
    const active = this.flights.get(profileId)
    if (active) {
      if (active.active?.kind === 'manual' && request.kind === 'manual') return active.done
      const pending = active.pending
      if (!pending || priority[request.kind] >= priority[pending.kind]) {
        active.pending = request.kind === 'background' && pending?.kind === 'background' && pending.profileChanged
          ? { ...request, profileChanged: true }
          : request
      }
      return active.done
    }

    let lease: ControllerLease | undefined
    const finish = () => {
      lease?.release()
      lease = undefined
      if (this.flights.get(profileId) === flight) this.flights.delete(profileId)
    }
    const flight: ProfileFlight = {
      pending: request,
      done: Promise.resolve().then(() => run({
        next: () => {
          flight.active = flight.pending
          flight.pending = undefined
          // Close admission in the same turn as observing an empty queue.
          if (!flight.active) finish()
          return flight.active
        },
        claim: (target) => {
          if (lease && lease.target.ip === target.ip && sameReconciliationTarget(lease.target, target)) {
            this.protectCurrentSaves(lease)
            return { lease }
          }
          lease?.release()
          lease = undefined
          const claim = this.claim(target)
          if ('lease' in claim) lease = claim.lease
          return claim
        },
      })).finally(finish),
    }
    this.flights.set(profileId, flight)
    return flight.done
  }

  private claim(target: ReconciliationTarget): { wait: Promise<void> } | { lease: ControllerLease } {
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
    this.protectCurrentSaves(lease)
    this.leases.add(lease)
    return { lease }
  }

  private protectCurrentSaves(lease: ControllerLease): void {
    lease.protectedBindings.clear()
    for (const save of this.foregroundSaves) {
      if (targetsOverlap(save.target, lease.target)) lease.protectedBindings.add(save.binding)
    }
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
