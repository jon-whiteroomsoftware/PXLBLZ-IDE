import { create } from 'zustand'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { applyControllerPixelCount } from '@/engine/applyControllerPixelCount'
import { throttleTrailing } from '@/engine/throttleTrailing'
import { getProgramLabels } from '@/engine/controllerMetadataStorage'
import type { ControllerConfig } from '@/engine/ControllerProvider'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import {
  POWER_CLIPPING_VARIABLE_NAME,
  POWER_LIMIT_VARIABLE_NAME,
} from '@/engine/powerTelemetry'
import {
  createLimitingSmoothingState,
  updateLimitingSmoothing,
  type LimitingSmoothingState,
} from '@/engine/limitingSmoothing'

// Polling orchestration for the live Controller panel (H6, issue #198).
//
// While a Controller is connected the panel mirrors a small slice of live device
// state: the active pattern (id, resolved to a name via the program list) and the
// reported FPS — both read-only — plus a volatile brightness slider. This store
// owns the polling lifecycle; the panel component calls start() while status is
// `connected` and stop() otherwise. Pure orchestration over the ControllerProvider
// seam — zero React, zero transport specifics.
//
// Brightness is *panel-owned and volatile* (never inherited from the preview,
// never persisted to flash — `save:false` always, mindful of flash wear). It is
// seeded once from the device's first reported value, then the slider owns it:
// later polls deliberately do not overwrite it, so a scrub never fights the poll.

export const CONTROLLER_POLL_INTERVAL_MS = 1000

/** Damp brightness-slider traffic: a drag fires onChange on every pixel of travel,
 *  but the device only needs ~10 updates/sec to track smoothly. Local state stays
 *  instant; only the WebSocket write is throttled. Trailing flush guarantees the
 *  final value lands so the device never settles on a stale brightness. */
export const BRIGHTNESS_SEND_INTERVAL_MS = 100

const sendBrightness = throttleTrailing((write: { provider: ReturnType<typeof getControllerProvider>; value: number }) => {
  void write.provider
    .setBrightness(write.value, false)
    .catch(() => {})
}, BRIGHTNESS_SEND_INTERVAL_MS)

interface ControllerPanelState {
  /** Last read brightness (0..1), seeded once then slider-owned. null until read. */
  brightness: number | null
  /** Id of the Controller's active program, resolved to a name by the panel view. */
  activeProgramId?: string
  /** Saved Pattern whose persistent activation is in flight. Store-owned so the
   *  lock survives closing and reopening the Controller popover. */
  activatingProgramId: string | null
  /** Sequencer mode reported by the Controller: 0 off, 1 shuffle, 2 playlist. */
  sequencerMode: number | null
  /** Whether the Controller's sequencer is currently running. */
  runSequencer: boolean | null
  /** Controller whose latest successful config read produced the config fields. */
  configSourceIp: string | null
  /** The Controller's program list, fetched once on start for id→name resolution. */
  programs: ProgramListEntry[]
  /** Connection-time program inventories keyed by Controller IP. Controller profile
   *  views reuse these snapshots instead of re-reading the device when opened. */
  programsByController: Record<string, ProgramListEntry[]>
  /** Per-program label cache for the active Controller (program id → label), loaded
   *  on seed and merged after each push (#237). Resolves a run-only program's name —
   *  one that never enters the device list — so the panel shows the pattern's name
   *  rather than the raw generated id. */
  programLabels: Record<string, string>
  /** Device-reported frame rate; null until reported. */
  fps: number | null
  /** Controller whose current open-panel session produced `fps`. Never cached;
   *  renderer transport may use the heartbeat only when this matches its target. */
  fpsSourceIp: string | null
  /** The device's configured pixel count; null until read. Editable via
   *  `setPixelCount` (#213) and refreshed from the device each poll. */
  pixelCount: number | null
  /** The count an in-flight `setPixelCount` is applying, or null when idle. While
   *  non-null the panel shows this value (the optimistic edit, never the device's
   *  stale poll) and disables/dims the input so the slow saved-count write reads as
   *  deliberate rather than janky (#213 follow-up). The poll ignores the device's
   *  reported count until it matches this, so the input never flashes back. */
  pixelCountPending: number | null
  /** The running pattern's live controls (name → value). Seeded from the device,
   *  then slider-owned until the active pattern changes (so a scrub never fights
   *  the poll); reseeded when `activeProgramId` changes. */
  activeControls: Record<string, number>
  /** The running pattern's exported variables (name → value), read-only. Refreshed
   *  every poll. */
  vars: Record<string, number>
  /** Three-poll limiter majority, updated only by successful vars polls. Kept in
   *  the per-Controller snapshot so closing the popover does not reset history. */
  limitingSmoothing: LimitingSmoothingState | null
  /** One-shot warm fetch: program list + a single poll, without
   *  starting the interval. Called on connect (#225) so the panel opens populated
   *  instead of empty-then-jumping, and reused by `start()` as its first tick. FPS
   *  is published only when `start()` owns an open-panel polling session. The
   *  optional `ip` identifies which Controller the state belongs to: reseeding the
   *  *same* device keeps the last-known values (no blank flash on a panel reopen),
   *  while a *different* device clears stale values first. */
  seed: (ip?: string) => void
  /** Begin polling (idempotent). Seeds once, then polls config + telemetry + vars
   *  on the interval. */
  start: (ip?: string) => void
  /** Stop polling. Keeps the last-known values so the next open shows them
   *  immediately while a fresh poll refreshes them; stale values from a *different*
   *  device are cleared by `seed()`, not here. */
  stop: () => void
  /** One poll tick: read config + telemetry + vars, tolerating transient failures. */
  poll: () => Promise<void>
  /** Re-fetch the device's program list into `programs`. Called after a save-mode push
   *  (#238) so the freshly-saved id is in the list and the panel resolves it via the list
   *  tier → the `unsaved` marker clears. Tolerates transient failure. */
  refreshPrograms: (ip?: string) => Promise<void>
  /** Set brightness on the device — volatile, never `save:true`. Optimistic local. */
  setBrightness: (value: number) => void
  /** Set the device's pixel count — persisted (`save:true`), since it is wiring
   *  config that must survive a reboot. Optimistic local; the next poll reconciles
   *  with whatever the device reports. (#213) */
  setPixelCount: (value: number) => void
  /** Set one control value on the device — volatile, never `save:true`. Optimistic. */
  setControl: (name: string, value: number) => void
  /** Set the running power-cap export — volatile and reset by the next pattern push. */
  setPowerLimit: (value: number) => void
  /** Merge a freshly-pushed program label into the local cache for immediate display
   *  (#237). The push path persists the cache to storage; this only mirrors it into the
   *  live slice so the panel resolves the new name without waiting for a reseed. */
  noteProgramLabel: (programId: string, label: string) => void
  /** Publish a program activation already confirmed by the push protocol, including
   *  the Controller that supplied that evidence. The next panel poll remains
   *  authoritative and can replace it after an external switch. */
  noteProgramActivated: (programId: string, controllerIp: string) => void
  /** Switch to a saved program and confirm it through an immediate poll. */
  activateProgram: (programId: string) => Promise<void>
  /** Delete a saved program and refresh the Controller inventory. */
  deleteProgram: (programId: string) => Promise<void>
}

export const controllerPanelInitialState = {
  brightness: null,
  activeProgramId: undefined,
  activatingProgramId: null as string | null,
  sequencerMode: null as number | null,
  runSequencer: null as boolean | null,
  configSourceIp: null,
  programs: [] as ProgramListEntry[],
  programsByController: {} as Record<string, ProgramListEntry[]>,
  fps: null,
  fpsSourceIp: null,
  pixelCount: null,
  pixelCountPending: null,
  activeControls: {} as Record<string, number>,
  vars: {} as Record<string, number>,
  limitingSmoothing: null as LimitingSmoothingState | null,
  programLabels: {} as Record<string, string>,
}

type ControllerPanelSnapshot = Pick<
  ControllerPanelState,
  | 'brightness'
  | 'activeProgramId'
  | 'sequencerMode'
  | 'runSequencer'
  | 'configSourceIp'
  | 'programs'
  | 'pixelCount'
  | 'pixelCountPending'
  | 'activeControls'
  | 'vars'
  | 'limitingSmoothing'
  | 'programLabels'
>

// Interval handle kept module-local (not in store state) so it never serializes
// and a stale render never holds a timer reference.
let pollTimer: ReturnType<typeof setInterval> | null = null
// A connect-time seed also calls poll(), but it must not publish FPS: only an open
// panel session owns a current renderer heartbeat. Capture this at poll invocation
// so closing the panel cannot turn a background warm-up into transport evidence.
let panelPollingActive = false

// Which program's controls the local `activeControls` currently belong to. Kept
// module-local (bookkeeping, not rendered): the poll adopts the device's controls
// when this differs from the reported active program, then leaves them slider-owned.
let controlsSeededFor: string | undefined

// Which Controller the current panel state belongs to. Module-local identity used
// to decide whether a reseed should keep the existing values (same device — a panel
// reopen) or clear them first (a genuine device switch). Undefined until first seed.
let seededForIp: string | undefined
// Monotonic guard for async fetches. Switching to a different Controller bumps
// this; late reads from the previous device must not write into the shared panel
// slice after the new device has populated it.
let panelSession = 0
let activationInFlight: symbol | null = null
const programRefreshVersions = new Map<string, number>()
const panelSnapshots = new Map<string, ControllerPanelSnapshot>()

function snapshotFromState(state: ControllerPanelState): ControllerPanelSnapshot {
  return {
    brightness: state.brightness,
    activeProgramId: state.activeProgramId,
    sequencerMode: state.sequencerMode,
    runSequencer: state.runSequencer,
    configSourceIp: state.configSourceIp,
    programs: state.programs,
    pixelCount: state.pixelCount,
    pixelCountPending: state.pixelCountPending,
    activeControls: state.activeControls,
    vars: state.vars,
    limitingSmoothing: state.limitingSmoothing,
    programLabels: state.programLabels,
  }
}

function saveSeededSnapshot(state: ControllerPanelState): void {
  if (seededForIp) panelSnapshots.set(seededForIp, snapshotFromState(state))
}

function configPatch(
  state: ControllerPanelState,
  config: ControllerConfig,
  sourceIp: string | null = seededForIp ?? null,
): Partial<ControllerPanelState> {
  const reseed = config.activeProgramId !== controlsSeededFor
  if (reseed) controlsSeededFor = config.activeProgramId
  return {
    activeProgramId: config.activeProgramId,
    sequencerMode: config.sequencerMode ?? state.sequencerMode,
    runSequencer: config.runSequencer ?? state.runSequencer,
    configSourceIp: sourceIp,
    brightness: state.brightness ?? config.brightness ?? null,
    pixelCount:
      state.pixelCountPending != null
        ? state.pixelCountPending
        : config.pixelCount ?? state.pixelCount,
    activeControls: reseed ? config.activeControls ?? {} : state.activeControls,
  }
}

function varsPollPatch(
  state: ControllerPanelState,
  vars: Record<string, number>,
): Pick<ControllerPanelState, 'vars' | 'limitingSmoothing'> {
  const clipping = vars[POWER_CLIPPING_VARIABLE_NAME]
  if (typeof clipping !== 'number') return { vars, limitingSmoothing: null }
  const sample = clipping > 0
  return {
    vars,
    limitingSmoothing: state.limitingSmoothing
      ? updateLimitingSmoothing(state.limitingSmoothing, sample)
      : createLimitingSmoothingState(sample),
  }
}

function controllerSessionMatches(
  session: number,
  provider: ReturnType<typeof getControllerProvider>,
): boolean {
  return session === panelSession && provider === getControllerProvider()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useControllerPanelStore = create<ControllerPanelState>()((set, get) => ({
  ...controllerPanelInitialState,

  seed: (ip) => {
    // Clear stale values only when opening a *different* Controller. A reopen of the
    // same device keeps its last-known values so the panel renders populated at once
    // and the warm fetch below just refreshes them — no blank-then-populate flash.
    if (ip !== seededForIp) {
      saveSeededSnapshot(get())
      seededForIp = ip
      panelSession += 1
      const cached = ip ? panelSnapshots.get(ip) : undefined
      controlsSeededFor = cached?.activeProgramId
      set({
        ...(cached ?? controllerPanelInitialState),
        programsByController: get().programsByController,
        activatingProgramId: get().activatingProgramId,
      })
    }
    const session = panelSession
    // Program names rarely change; fetch the list once and tolerate failure.
    void get().refreshPrograms(ip)
    // Load this Controller's program label cache (#237) so a previously run-only push
    // resolves to its name on reopen rather than the raw id. Keyed by Controller ip;
    // an unknown ip yields an empty cache (only the device list resolves names then).
    getProgramLabels()
      .then((store) => {
        if (session === panelSession) set({ programLabels: ip ? store[ip] ?? {} : {} })
      })
      .catch(() => {})
    void get().poll()
  },

  start: (ip) => {
    if (pollTimer !== null) return
    panelPollingActive = true
    get().seed(ip)
    pollTimer = setInterval(() => void get().poll(), CONTROLLER_POLL_INTERVAL_MS)
  },

  stop: () => {
    panelPollingActive = false
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    // Invalidate reads started by the closing session before clearing its FPS.
    // A reconnect can otherwise let an old provider's late telemetry repopulate
    // the heartbeat after the control has deliberately returned to unknown.
    panelSession += 1
    // Deliberately keep the visible panel content and `seededForIp`: closing the
    // panel must not wipe controls, vars, or config. FPS is different: it is a
    // connection-session heartbeat, so discard it until the next live poll rather
    // than presenting a cached value as current renderer evidence (#749).
    set({ fps: null, fpsSourceIp: null })
    // `controlsSeededFor` is cleared so the next poll re-adopts the device's
    // controls — those equal the last local values (we wrote them through), so
    // reopening remains identical on screen apart from the intentionally fresh FPS.
    controlsSeededFor = undefined
  },

  poll: async () => {
    const session = panelSession
    const acceptsFps = panelPollingActive
    const fpsSourceIp = acceptsFps ? seededForIp ?? null : null
    const provider = getControllerProvider()
    const [config, telemetry, vars] = await Promise.all([
      provider.getConfig().catch(() => null),
      provider.getTelemetry().catch(() => null),
      provider.getVars().catch(() => null),
    ])
    if (session !== panelSession) return
    if (config) {
      set((state) => configPatch(state, config))
    }
    if (telemetry && acceptsFps) set({ fps: telemetry.fps, fpsSourceIp })
    if (vars) set((state) => varsPollPatch(state, vars))
  },

  refreshPrograms: async (ip = seededForIp) => {
    const session = panelSession
    const provider = getControllerProvider()
    const requestKey = ip ?? ''
    const requestVersion = (programRefreshVersions.get(requestKey) ?? 0) + 1
    programRefreshVersions.set(requestKey, requestVersion)
    try {
      const programs = await provider.listPrograms()
      if (programRefreshVersions.get(requestKey) !== requestVersion) return
      set((state) => ({
        ...(controllerSessionMatches(session, provider) && (!ip || ip === seededForIp)
          ? { programs }
          : {}),
        ...(ip
          ? { programsByController: { ...state.programsByController, [ip]: programs } }
          : {}),
      }))
    } catch {
      // Transient — keep the last-known list.
    }
  },

  setBrightness: (value) => {
    set({ brightness: value })
    sendBrightness({ provider: getControllerProvider(), value })
  },

  setPixelCount: async (value) => {
    // Capture the live device count before the optimistic local set so the helper
    // can tell a reduction (which blacks out the strip before shrinking so the tail
    // LEDs go dark, #222) from a raise.
    const prev = get().pixelCount
    // Show the new value at once and mark the write in flight: the panel dims and
    // disables the input, and the poll holds this value instead of flashing back to
    // the device's stale count while the slow saved write lands.
    set({ pixelCount: value, pixelCountPending: value })
    try {
      await applyControllerPixelCount(getControllerProvider(), value, prev)
      // Poll immediately so the device's freshly-reported count clears the hold now
      // rather than after the next interval tick — re-enabling the input promptly.
      await get().poll()
    } catch {
      // Tolerate a failed write; the finally releases the hold either way.
    } finally {
      // Always release the hold once the write sequence has completed. The confirming
      // poll above clears it on success; this guards the case where the firmware
      // *silently drops* the write (#204) so the device never reports the new count —
      // without it the input would stay disabled forever. With the hold released, the
      // next poll reconciles the displayed count to the device's real value.
      if (get().pixelCountPending != null) set({ pixelCountPending: null })
    }
  },

  setControl: (name, value) => {
    set((s) => ({ activeControls: { ...s.activeControls, [name]: value } }))
    void getControllerProvider()
      .setControls({ [name]: value }, false)
      .catch(() => {})
  },

  setPowerLimit: (value) => {
    const limit = Math.max(0, Math.min(1, value))
    set((s) => ({
      vars: { ...s.vars, [POWER_LIMIT_VARIABLE_NAME]: limit },
    }))
    void getControllerProvider()
      .setVars({ [POWER_LIMIT_VARIABLE_NAME]: limit })
      .catch(() => {})
  },

  noteProgramLabel: (programId, label) => {
    set((s) => ({ programLabels: { ...s.programLabels, [programId]: label } }))
  },

  noteProgramActivated: (programId, controllerIp) => {
    set({ activeProgramId: programId, configSourceIp: controllerIp })
  },

  activateProgram: async (programId) => {
    if (activationInFlight !== null) {
      throw new Error('A Controller Pattern switch is already in progress.')
    }
    const activation = Symbol(programId)
    activationInFlight = activation
    set({ activatingProgramId: programId })
    try {
      const initiatingSession = panelSession
      const provider = getControllerProvider()
      const previousActiveProgramId = get().activeProgramId
      const previousActiveControls = get().activeControls
      const previousControlsSeededFor = controlsSeededFor
      let confirmationSession: number | null = null
      const rollbackOptimisticActivation = () => {
        if (
          confirmationSession == null
          || confirmationSession !== panelSession
          || provider !== getControllerProvider()
        ) return
        controlsSeededFor = previousControlsSeededFor
        set({
          activeProgramId: previousActiveProgramId,
          activeControls: previousActiveControls,
        })
      }
      await provider.setActiveProgram(programId, { save: true })
      if (!controllerSessionMatches(initiatingSession, provider)) {
        throw new Error('Controller session changed before Pattern activation could be confirmed.')
      }
      panelSession += 1
      confirmationSession = panelSession
      controlsSeededFor = undefined
      set({ activeProgramId: programId, activeControls: {} })
      let config: ControllerConfig
      try {
        config = await provider.getConfig()
      } catch (error) {
        rollbackOptimisticActivation()
        throw new Error(
          `Could not confirm Controller Pattern activation: ${errorMessage(error)}`,
          { cause: error },
        )
      }
      if (!controllerSessionMatches(confirmationSession, provider)) {
        rollbackOptimisticActivation()
        throw new Error('Controller session changed before Pattern activation could be confirmed.')
      }
      if (config.activeProgramId !== programId) {
        rollbackOptimisticActivation()
        throw new Error(
          `Controller did not activate Pattern ${programId}; active Pattern is ${config.activeProgramId ?? 'unknown'}.`,
        )
      }
      set((state) => configPatch(state, config))
    } finally {
      if (activationInFlight === activation) {
        activationInFlight = null
        set({ activatingProgramId: null })
      }
    }
  },

  deleteProgram: async (programId) => {
    const session = panelSession
    const ip = seededForIp
    const provider = getControllerProvider()
    let beforePrograms: ProgramListEntry[]
    try {
      beforePrograms = await provider.listPrograms()
    } catch (error) {
      throw new Error(
        `Could not read Controller inventory before deletion: ${errorMessage(error)}`,
        { cause: error },
      )
    }
    if (!controllerSessionMatches(session, provider)) {
      throw new Error('Controller session changed before Pattern deletion could start.')
    }
    if (!beforePrograms.some((program) => program.id === programId)) {
      set((state) => ({
        programs: beforePrograms,
        ...(ip
          ? { programsByController: { ...state.programsByController, [ip]: beforePrograms } }
          : {}),
      }))
      return
    }
    await provider.deleteProgram(programId)
    let programs: ProgramListEntry[]
    try {
      programs = await provider.listPrograms()
    } catch (error) {
      throw new Error(
        `Could not confirm Controller Pattern deletion: ${errorMessage(error)}`,
        { cause: error },
      )
    }
    if (!controllerSessionMatches(session, provider)) {
      throw new Error('Controller session changed before Pattern deletion could be confirmed.')
    }
    set((state) => ({
      programs,
      ...(ip
        ? { programsByController: { ...state.programsByController, [ip]: programs } }
        : {}),
    }))
    const missingUnrelated = beforePrograms.filter(
      (before) => before.id !== programId
        && !programs.some((after) => after.id === before.id && after.name === before.name),
    )
    if (missingUnrelated.length > 0) {
      throw new Error(
        `Controller deletion of Pattern ${programId} also removed unrelated Pattern ${missingUnrelated.map((program) => program.id).join(', ')}.`,
      )
    }
    if (programs.some((program) => program.id === programId)) {
      throw new Error(`Controller still reports Pattern ${programId} after deletion.`)
    }
  },
}))
