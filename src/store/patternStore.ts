import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  DEMO_OVERRIDES_KEY,
  LAST_ACTIVE_KEY,
  type LastActive,
  getPersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { PatternRecord } from '@/engine/personalContentRecords'
import { discardLegacyPreviewSpeed, type Settings } from '@/engine/settings'
import { extractPatternAuthors, normalizePatternAuthors } from '@/engine/patternAttribution'
import { useEditorStore } from '@/store/editorStore'
import { flushPendingAutosave } from '@/store/autosaveSync'

export type { LastActive, PatternRecord }
export { DEMO_OVERRIDES_KEY, LAST_ACTIVE_KEY }

interface PatternState {
  activePatternId: string | null
  activeLibraryName: string | null
  activeDemoName: string | null
  userPatterns: PatternRecord[]
  // True once loadPatterns has resolved. Deep links to /studio/patterns/<id>
  // can't distinguish "not found" from "not loaded yet" without it (#308).
  patternsLoaded: boolean
  // Persisted per-demo settings overrides (cascade layer 1),
  // keyed by demo name. Parallel to PatternRecord.settings for user patterns; a demo
  // has no record so its bag lives here instead.
  demoOverrides: Record<string, Partial<Settings>>
  settingsSaveFailed: boolean
  retrySettingsPersistence: () => Promise<void>
  setActivePattern: (id: string | null) => void
  setActiveLibrary: (name: string | null) => void
  setActiveDemo: (name: string | null) => void
  loadPatterns: () => Promise<void>
  // Hydrate the persisted demo-override map from the settings KV store at startup,
  // alongside loadPatterns.
  loadDemoOverrides: () => Promise<void>
  addPattern: (record: PatternRecord) => Promise<void>
  renamePattern: (id: string, name: string) => Promise<void>
  removePattern: (id: string) => Promise<void>
  updatePatternSrc: (id: string, src: string) => Promise<void>
  // Sparse-merge per-pattern settings overrides (cascade layer 1) onto the
  // record, in both D1 and the in-memory list, so reopening restores them this
  // session. Called from a control's own change handler on genuine manipulation —
  // never inferred by comparing a stored value to a default.
  updatePatternSettings: (id: string, patch: Partial<Settings>) => Promise<void>
  // Clear a pattern's layer-1 overrides ("Reset to defaults"), dropping it
  // back to recommended + global-sticky + dev-default on the next resolve.
  resetPatternSettings: (id: string) => Promise<void>
  // Sparse-merge per-demo settings overrides (cascade layer 1) — the demo equivalent
  // of updatePatternSettings, persisted into the demoOverrides KV map.
  updateDemoSettings: (name: string, patch: Partial<Settings>) => Promise<void>
  // Clear a demo's layer-1 overrides ("Revert to recommended"), dropping it back to
  // recommended + global-sticky + dev-default on the next resolve.
  resetDemoSettings: (name: string) => Promise<void>
}

// The stable identity of the open *pushable* pattern — the key Send-to-Controller
// uses for its device binding (save mode) and its dirty-track records. A user
// pattern is keyed by its record id; a demo, which carries no record, by a
// `demo:`-namespaced key off its name, so demos can be pushed and dirty-tracked
// without first forking into the user area. Libraries are not patterns, so they
// have no key (null → the Send button doesn't render). The `demo:` namespace
// keeps demo and user ids from ever colliding in the binding/dirty maps.
export function activePushKey(
  s: Pick<PatternState, 'activePatternId' | 'activeDemoName'>,
): string | null {
  if (s.activePatternId !== null) return s.activePatternId
  if (s.activeDemoName !== null) return `demo:${s.activeDemoName}`
  return null
}

export const patternInitialState = {
  activePatternId: null as string | null,
  activeLibraryName: null as string | null,
  activeDemoName: null as string | null,
  userPatterns: [] as PatternRecord[],
  patternsLoaded: false,
  demoOverrides: {} as Record<string, Partial<Settings>>,
  settingsSaveFailed: false,
}

export const usePatternStore = create<PatternState>()((set, get) => ({
  ...patternInitialState,

  // Every activation setter flushes the pending autosave first (#810): these
  // run at the top of each buffer-replacing open path, while the outgoing
  // buffer and its owning record are still the editor's current state.
  setActivePattern: (id) => {
    flushPendingAutosave()
    set({ activePatternId: id, activeLibraryName: null, activeDemoName: null })
    if (id !== null) getPersonalContentProvider().setLastActive({ type: 'pattern', id }).catch(() => {})
  },
  setActiveLibrary: (name) => {
    flushPendingAutosave()
    set({ activeLibraryName: name, activePatternId: null, activeDemoName: null })
    if (name !== null) getPersonalContentProvider().setLastActive({ type: 'library', name }).catch(() => {})
  },
  setActiveDemo: (name) => {
    flushPendingAutosave()
    set({ activeDemoName: name, activeLibraryName: null, activePatternId: null })
    if (name !== null) getPersonalContentProvider().setLastActive({ type: 'demo', name }).catch(() => {})
  },

  loadPatterns: async () => {
    const patterns = await getPersonalContentProvider().listPatterns()
    set((s) => ({
      userPatterns: patterns.map((pattern) => {
        const local = pendingSettingsWrites.has(pattern.id)
          ? s.userPatterns.find((p) => p.id === pattern.id)
          : undefined
        const settings = local?.settings ?? pattern.settings
        return settings ? { ...pattern, settings: discardLegacyPreviewSpeed(settings) } : pattern
      }).sort((a, b) => b.updatedAt - a.updatedAt),
      patternsLoaded: true,
    }))
  },

  loadDemoOverrides: async () => {
    const stored = await getPersonalContentProvider().getDemoOverrides().catch(() => undefined)
    if (stored && !pendingSettingsWrites.has(null)) {
      set({ demoOverrides: Object.fromEntries(Object.entries(stored).map(([name, settings]) => [name, discardLegacyPreviewSpeed(settings)])) })
    }
  },

  addPattern: async (record) => {
    const persisted = patternRecordWithAttribution(record.settings ? { ...record, settings: discardLegacyPreviewSpeed(record.settings) } : record)
    await getPersonalContentProvider().createPattern(persisted)
    trackEntityCreated('pattern')
    set((s) => ({
      userPatterns: [persisted, ...s.userPatterns],
    }))
  },

  renamePattern: async (id, name) => {
    const updatedAt = Date.now()
    await getPersonalContentProvider().updatePattern(id, { name, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, name, updatedAt } : p,
      ),
    }))
    if (get().activePatternId === id) useEditorStore.getState().setPreviewPatternName(name)
  },

  removePattern: async (id) => {
    while (activeSettingsFlushes.has(id)) {
      await activeSettingsFlushes.get(id)
    }
    await getPersonalContentProvider().deletePattern(id)
    const { activePatternId, userPatterns } = get()
    const remaining = userPatterns.filter((p) => p.id !== id)
    set({
      userPatterns: remaining,
      activePatternId: activePatternId === id ? (remaining[0]?.id ?? null) : activePatternId,
    })
    pendingSettingsWrites.delete(id)
    failedSettingsWrites.delete(id)
    syncSettingsPersistence()
  },

  updatePatternSrc: async (id, src) => {
    const existing = get().userPatterns.find((p) => p.id === id)
    if (existing?.src === src) return
    const updatedAt = Date.now()
    const extractedAuthors = extractPatternAuthors(src)
    const authorPatch = extractedAuthors.length > 0 ? { authors: extractedAuthors } : {}
    await getPersonalContentProvider().updatePattern(id, { src, ...authorPatch, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, src, ...authorPatch, updatedAt } : p,
      ),
    }))
  },

  updatePatternSettings: async (id, patch) => {
    // Sparse merge over any existing overrides; the src/updatedAt bump is
    // intentionally skipped: a settings override is a display-side concern, not an
    // edit to the pattern's code, so it shouldn't reorder the recents list.
    let merged: Partial<Settings> | undefined
    set((s) => ({
      userPatterns: s.userPatterns.map((p) => {
        if (p.id !== id) return p
        merged = discardLegacyPreviewSpeed({ ...p.settings, ...patch })
        return { ...p, settings: merged }
      }),
    }))
    if (merged === undefined) return
    await queuePatternSettingsWrite(id, merged)
  },

  resetPatternSettings: async (id) => {
    set((s) => ({
      userPatterns: s.userPatterns.map((p) => (p.id === id ? { ...p, settings: {} } : p)),
    }))
    await queuePatternSettingsWrite(id, {})
  },

  updateDemoSettings: async (name, patch) => {
    // Sparse merge over any existing demo overrides, dropping the entry when empty.
    let next: Record<string, Partial<Settings>> | undefined
    set((s) => {
      const merged = discardLegacyPreviewSpeed({ ...s.demoOverrides[name], ...patch })
      if (Object.keys(merged).length === 0) {
        const { [name]: _drop, ...rest } = s.demoOverrides
        next = rest
      } else {
        next = { ...s.demoOverrides, [name]: merged }
      }
      return { demoOverrides: next }
    })
    if (next) await queueDemoOverridesWrite(next)
  },

  resetDemoSettings: async (name) => {
    let next: Record<string, Partial<Settings>> | undefined
    set((s) => {
      const { [name]: _drop, ...rest } = s.demoOverrides
      next = rest
      return { demoOverrides: next }
    })
    if (next) await queueDemoOverridesWrite(next)
  },

  retrySettingsPersistence: async () => {
    await Promise.all(Array.from(failedSettingsWrites, flushSettingsWrites))
  },
}))

// Each Pattern has its own coalescing queue. The demo overrides share one
// storage value and use the null key. Keep the latest snapshot until storage
// acknowledges it, including while a failed write waits for Retry.
type SettingsWriteKey = string | null
const pendingSettingsWrites = new Map<SettingsWriteKey, () => Promise<void>>()
const activeSettingsFlushes = new Map<SettingsWriteKey, Promise<void>>()
const failedSettingsWrites = new Set<SettingsWriteKey>()

let settingsUnloadGuardAttached = false

export function hasPendingSettingsPersistence(): boolean {
  return pendingSettingsWrites.size > 0 || activeSettingsFlushes.size > 0
}

function handleSettingsBeforeUnload(event: BeforeUnloadEvent): void {
  if (hasPendingSettingsPersistence()) event.preventDefault()
}

function syncSettingsUnloadGuard(): void {
  if (typeof window === 'undefined') return
  const pending = hasPendingSettingsPersistence()
  if (pending && !settingsUnloadGuardAttached) {
    window.addEventListener('beforeunload', handleSettingsBeforeUnload)
    settingsUnloadGuardAttached = true
  } else if (!pending && settingsUnloadGuardAttached) {
    window.removeEventListener('beforeunload', handleSettingsBeforeUnload)
    settingsUnloadGuardAttached = false
  }
}

function syncSettingsPersistence(): void {
  syncSettingsUnloadGuard()
  const settingsSaveFailed = failedSettingsWrites.size > 0
  if (usePatternStore.getState().settingsSaveFailed !== settingsSaveFailed) {
    usePatternStore.setState({ settingsSaveFailed })
  }
}

function queuePatternSettingsWrite(id: string, settings: Partial<Settings>): Promise<void> {
  const provider = getPersonalContentProvider()
  pendingSettingsWrites.set(id, async () => provider.updatePattern(id, { settings }))
  return flushSettingsWrites(id)
}

function queueDemoOverridesWrite(overrides: Record<string, Partial<Settings>>): Promise<void> {
  const provider = getPersonalContentProvider()
  pendingSettingsWrites.set(null, async () => provider.setDemoOverrides(overrides))
  return flushSettingsWrites(null)
}

function flushSettingsWrites(key: SettingsWriteKey): Promise<void> {
  const existing = activeSettingsFlushes.get(key)
  if (existing) return existing
  const flush = (async () => {
    try {
      let write = pendingSettingsWrites.get(key)
      while (write) {
        try {
          await write()
          if (pendingSettingsWrites.get(key) === write) {
            pendingSettingsWrites.delete(key)
            failedSettingsWrites.delete(key)
          }
        } catch {
          const latest = pendingSettingsWrites.get(key)
          if (!latest) break // The Pattern was deleted during the write.
          failedSettingsWrites.add(key)
          if (latest === write) break
          syncSettingsPersistence()
        }
        write = pendingSettingsWrites.get(key)
      }
    } finally {
      activeSettingsFlushes.delete(key)
      syncSettingsPersistence()
    }
  })()
  activeSettingsFlushes.set(key, flush)
  syncSettingsUnloadGuard()
  return flush
}

function patternRecordWithAttribution(record: PatternRecord): PatternRecord {
  const structured = normalizePatternAuthors(record.authors)
  if (structured.length > 0) return { ...record, authors: structured }
  const extracted = extractPatternAuthors(record.src)
  return extracted.length > 0 ? { ...record, authors: extracted } : record
}
