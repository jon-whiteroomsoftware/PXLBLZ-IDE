// The #1029 sequence against a `ShowRecordV2`, through the real browser MCP
// path (#1039, specification section 12 row MCP).
//
// Nothing here is simulated between the tool call and the saved record: a real
// Worker runs in Miniflare with the real OAuth authority and account Durable
// Object, a real `createAgentBrowserSession` holds the binding and runs its own
// receive loop, and it drives the real editor admission, private executor and
// v2 candidate admission over the real Show store. The oracles are what a
// consumer sees - the provider's saved record and the reopened `.pxlshow` and
// `.epe` - plus the store's history and save counts.
//
// The one thing this does not run is a browser engine: esbuild cannot bundle
// the Worker inside jsdom, so the test supplies the minimal window surface the
// admission observes - the route path and the history/navigation events it
// closes on. Its Chromium proof drove the rejected v2 route and was retired
// with that route (#1065); the existing editor's own agent proof is #1066.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createSessionToken } from '../../cloudflare/auth'
import { createAgentBrowserSession } from '../../agent/browserSession'
import { createAgentEditorAdmission } from '../../agent/editorAdmission'
import { convertShowRecordV1ToV2 } from '../../engine/showRecordV1ToV2'
import { convertibleV1Show } from '../../test/showV2TracerFixture'
import { captureShowStageEditV2, prepareShowStageV2 } from '../../engine/showPreparedStageV2'
import { buildShowEpeExportV2 } from '../../engine/showEpeExportV2'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '../../engine/showFileBundle'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../../engine/personalContentProvider'
import { showInitialState, useShowStore } from '../../store/showStore'
import { usePatternStore } from '../../store/patternStore'
import { admitShowV2PilotSetShowEnd } from '../../store/showV2PreparedEditAdmission'
import { STOCK_SHOW_IDS } from '../../pixelblaze/stock/showIds'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'
import type { ShowRecordV2 } from '../../engine/showCompositionV2'

globalThis.Blob = (await import('node:buffer')).Blob as unknown as typeof globalThis.Blob

// The admission observes actual route changes to close itself; nothing else in
// this path touches the DOM.
const routeListeners = new Map<string, Set<() => void>>()
let routePath = '/'
// This project shares one process across test files (`isolate: false`), and
// Zustand's persist middleware captures `window.localStorage` once, when a
// persisted store module is first imported. A window without storage would
// leave every such store imported from here on crashing on its first write, in
// whichever later file touched it, so the shim carries working storage and is
// removed when this file ends (#1039).
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}
const hadWindow = 'window' in globalThis
globalThis.window = {
  localStorage: memoryStorage(),
  sessionStorage: memoryStorage(),
  location: { get pathname() { return routePath } },
  history: {
    pushState: (_state: unknown, _title: string, url: string) => { routePath = new URL(url, 'https://app.test').pathname },
    replaceState: (_state: unknown, _title: string, url: string) => { routePath = new URL(url, 'https://app.test').pathname },
  },
  addEventListener: (type: string, listener: () => void) => {
    if (!routeListeners.has(type)) routeListeners.set(type, new Set())
    routeListeners.get(type)!.add(listener)
  },
  removeEventListener: (type: string, listener: () => void) => { routeListeners.get(type)?.delete(listener) },
} as unknown as Window & typeof globalThis

const VOICE = 'export var t = 0\nexport function beforeRender(delta) { t += delta }\nexport function render2D(index, x, y) { rgb(x, y, t / 1000) }'
const PATTERN = { id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }
const client = { clientId: 'test-client', clientName: 'Test Agent', redirectUris: ['https://client.test/callback'] }
const verifier = 'b'.repeat(43)

let script: string
let runtime: Miniflare
let cookie: string
const runtimes: Miniflare[] = []
beforeAll(async () => {
  const bundle = await build({ entryPoints: ['src/worker/index.ts'], external: ['cloudflare:workers'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })
  script = bundle.outputFiles[0].text
  cookie = `pxlblz_session=${await createSessionToken({ userId: 'github:123', primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null }, 'v2-command-secret')}`
}, 60_000)
afterAll(async () => {
  await Promise.all(runtimes.map(entry => entry.dispose()))
  resetPersonalContentProvider()
  if (!hadWindow) delete (globalThis as { window?: unknown }).window
})

function startRuntime() {
  const started = new Miniflare(convertV4MiniflareOptions({
    modules: true, script, compatibilityDate: '2026-06-30',
    compatibilityFlags: ['global_fetch_strictly_public'],
    bindings: {
      SESSION_SECRET: 'v2-command-secret', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'github:123',
      AGENT_OAUTH_ORIGIN: 'https://app.test', AGENT_OAUTH_CLIENTS: JSON.stringify([client]),
    },
    durableObjects: {
      AGENT_ACCOUNTS: { className: 'AgentAccount', useSQLite: true },
      AGENT_OAUTH_AUTHORITY: { className: 'AgentOAuthAuthority', useSQLite: true },
    },
  }))
  runtimes.push(started)
  return started
}

/** One real authorization-code grant for the canonical MCP endpoint. */
async function authorize(): Promise<string> {
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url')
  const authorizeUrl = `https://app.test/oauth/authorize?${new URLSearchParams({
    agent: '1', client_id: client.clientId, redirect_uri: client.redirectUris[0], response_type: 'code',
    scope: 'agent:connect', state: 'v2-state', resource: 'https://app.test/mcp',
    code_challenge_method: 'S256', code_challenge: challenge,
  })}`
  const consent = await (await runtime.dispatchFetch(authorizeUrl, { headers: { Cookie: cookie } })).text()
  const nonce = consent.match(/name="nonce" value="([^"]+)"/)![1]
  const answered = await runtime.dispatchFetch('https://app.test/oauth/authorize', {
    method: 'POST', headers: { Origin: 'https://app.test', Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ nonce, decision: 'allow' }).toString(), redirect: 'manual',
  })
  const code = new URL(answered.headers.get('Location')!).searchParams.get('code')!
  const token = await runtime.dispatchFetch('https://app.test/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.clientId, resource: 'https://app.test/mcp', grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: client.redirectUris[0] }).toString(),
  })
  return (await token.json() as { access_token: string }).access_token
}

function v2Record(id: string): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const record = converted.record
  record.id = id
  record.name = 'Commanded v2 Show'
  record.composition.showEndMs = 20_000
  record.composition.layoutOccurrences[0].durationMs = 20_000
  record.composition.clips[0].durationMs = 10_000
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  return record
}

it('runs the #1029 sequence over a v2 record through the real MCP path and reopens the saved artifacts', async () => {
  runtime = startRuntime()
  const token = await authorize()
  // The channel route resolves same-account Show authority before it registers
  // a window; a built-in identity gives that without a D1 binding. The record
  // this editor holds is the v2 one below, exactly as a converted row would be.
  const record = v2Record(STOCK_SHOW_IDS[0])
  window.history.replaceState(null, '', `/studio/shows/${record.id}`)
  useShowStore.setState(showInitialState)
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({
    ...getPersonalContentProvider(), id: 'mcp-v2', replaceShowV2: write,
    listShowDocumentsV2: async () => [structuredClone(saved)],
  })
  usePatternStore.setState({ userPatterns: [PATTERN], patternsLoaded: true } as never)
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })

  const dependencies = { patterns: [PATTERN], maps: [], libraries: [], profiles: [], stageMap: null }
  let capture = captureShowStageEditV2(record, dependencies)
  expect(capture.prepared.status).toBe('ready')
  const unsubscribe = useShowStore.subscribe(() => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    if (current && current !== capture.record) capture = captureShowStageEditV2(current, dependencies)
  })
  const admission = createAgentEditorAdmission(record.id, () => ({ playheadMs: 0 }), undefined, undefined, {
    capture: () => capture,
    isCurrentCapture: () => useShowStore.getState().showV2Pilots[record.id] === capture.record,
  })
  const session = createAgentBrowserSession({
    admission, showId: record.id,
    fetch: (async (_url: string, init: RequestInit) => {
      const response = await runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', {
        method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', Cookie: cookie },
        body: init.body as string,
      })
      return Response.json(await response.json())
    }) as unknown as typeof fetch,
  })

  const rpc = async (method: string, params?: unknown) => {
    const response = await runtime.dispatchFetch('https://app.test/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
    })
    return await response.json() as { result: { structuredContent: Record<string, unknown>; tools?: Array<{ name: string }>; isError?: boolean } }
  }
  const tool = (name: string, args: object = {}) => rpc('tools/call', { name, arguments: args })

  try {
    await session.ready
    await session.arm()
    const connected = await tool('get_connection')
    expect(connected.result.structuredContent.code).toBe('bound')
    const binding_id = connected.result.structuredContent.binding_id as string

    // The registered tool surface is the one this v2 record's commands need.
    const listed = new Set((await rpc('tools/list')).result.tools!.map(entry => entry.name))
    for (const command of SHOW_COMMANDS_V2) expect(listed, command.name).toContain(command.name)
    expect(listed).not.toContain('add_clip')

    const read = await tool('read_show', { binding_id })
    expect(read.result.structuredContent.code).toBe('read')
    expect((read.result.structuredContent.show as ShowRecordV2).version).toBe(2)
    expect(read.result.structuredContent.show).toEqual(record)

    const begun = await tool('begin_edit', { binding_id, intent: 'Rebuild the overlay', idempotency_key: 'begin' })
    expect(begun.result.structuredContent.code).toBe('begun')
    const operation_id = begun.result.structuredContent.operation_id as string
    const identity = { binding_id, operation_id }

    const created = await tool('create_layers', {
      ...identity, idempotency_key: 'layers',
      layers: [{
        zone_id: record.zones[0].id, name: 'Overlay',
        clips: [{ zone_id: record.zones[0].id, start_ms: 0, duration_ms: 8_000, pattern: { kind: 'user', id: 'voice' }, instance: 'sole' }],
      }],
    })
    expect(created.result.structuredContent.code).toBe('changed')
    const changes = created.result.structuredContent.changes as Array<{ details: { layers: string[]; clips: string[] } }>
    const newLayerId = changes.flatMap(change => change.details.layers)[0]
    const newClipId = changes.flatMap(change => change.details.clips)[0]

    expect((await tool('remove_clips', { ...identity, idempotency_key: 'remove', clip_ids: [record.composition.clips[0].id] })).result.structuredContent.code).toBe('changed')
    expect((await tool('set_show_end', { ...identity, idempotency_key: 'end', end_ms: 30_000 })).result.structuredContent.code).toBe('changed')
    expect((await tool('add_property_tracks', {
      ...identity, idempotency_key: 'tracks',
      tracks: [{ target: { kind: 'opacity', clip_id: newClipId }, keyframes: [{ at_ms: 0, value: 0, easing: 'linear' }, { at_ms: 8_000, value: 1, easing: 'linear' }] }],
    })).result.structuredContent.code).toBe('changed')

    // A domain refusal reaches the caller and leaves the private candidate open.
    const refused = await tool('remove_clips', { ...identity, idempotency_key: 'bad', clip_ids: ['not-a-clip'] })
    expect(refused.result.structuredContent.code).toBe('refused')
    expect(write).not.toHaveBeenCalled()

    expect((await tool('commit_edit', { ...identity, idempotency_key: 'commit' })).result.structuredContent.code).toBe('outcome')
    await vi.waitFor(async () => {
      const outcome = await tool('get_outcome', identity)
      expect(outcome.result.structuredContent).toMatchObject({ code: 'outcome', receipt: { status: 'applied', settlement: 'saved' } })
    })

    expect(write).toHaveBeenCalledTimes(1)
    expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
    expect(saved.composition.showEndMs).toBe(30_000)
    expect(saved.composition.clips.map(clip => clip.id)).toEqual([newClipId])
    expect(saved.composition.layers.some(entry => entry.id === newLayerId)).toBe(true)
    expect(saved.composition.propertyTracks).toHaveLength(1)

    const bundle = buildShowFileBundle(saved, { patterns: [PATTERN], maps: [], libraries: [] }, { appVersion: 'mcp-v2', exportedAt: '2026-01-01T00:00:00.000Z' })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle.bundle), { acceptV2: true })
    expect(reopened.version).toBe(2)
    expect(reopened.show).toEqual(saved)
    const prepared = prepareShowStageV2(saved, dependencies)
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') throw new Error('prepared')
    expect(buildShowEpeExportV2(saved, prepared.bundle.artifact.code).status).toBe('exported')
  } finally {
    session.close()
    unsubscribe()
    admission.close()
  }
}, 120_000)

/** One live binding over a v2 record, with the store and provider behind it. */
let identityIndex = 0
async function boundEditor(options: { failSave?: boolean } = {}) {
  runtime = startRuntime()
  const token = await authorize()
  // A distinct Show identity per test: the store's durable v2 baseline is
  // module state keyed by Show id, so a reused id would let one test's saved
  // record become the next test's rollback target.
  const record = v2Record(STOCK_SHOW_IDS[(identityIndex += 1) % STOCK_SHOW_IDS.length])
  window.history.replaceState(null, '', `/studio/shows/${record.id}`)
  useShowStore.setState(showInitialState)
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => {
    if (options.failSave) throw new Error('save refused')
    saved = structuredClone(next)
  })
  setPersonalContentProvider({
    ...getPersonalContentProvider(), id: 'mcp-v2-failure', replaceShowV2: write,
    listShowDocumentsV2: async () => [structuredClone(saved)],
  })
  usePatternStore.setState({ userPatterns: [PATTERN], patternsLoaded: true } as never)
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const dependencies = { patterns: [PATTERN], maps: [], libraries: [], profiles: [], stageMap: null }
  let capture = captureShowStageEditV2(record, dependencies)
  const unsubscribe = useShowStore.subscribe(() => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    if (current && current !== capture.record) capture = captureShowStageEditV2(current, dependencies)
  })
  const admission = createAgentEditorAdmission(record.id, () => ({ playheadMs: 0 }), undefined, undefined, {
    capture: () => capture,
    isCurrentCapture: () => useShowStore.getState().showV2Pilots[record.id] === capture.record,
  })
  const session = createAgentBrowserSession({
    admission, showId: record.id,
    fetch: (async (_url: string, init: RequestInit) => {
      const response = await runtime.dispatchFetch('https://app.test/api/agent/channel?agent=1', {
        method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', Cookie: cookie },
        body: init.body as string,
      })
      return Response.json(await response.json())
    }) as unknown as typeof fetch,
  })
  const tool = async (name: string, args: object = {}) => {
    const response = await runtime.dispatchFetch('https://app.test/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    })
    return (await response.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent
  }
  await session.ready
  await session.arm()
  const connected = await tool('get_connection')
  expect(connected.code).toBe('bound')
  // The relay requires the caller to have read the Show before it may begin one.
  const read = await tool('read_show', { binding_id: connected.binding_id as string })
  expect(read).toMatchObject({ code: 'read' })
  expect((read.show as ShowRecordV2).version).toBe(2)
  return {
    record, write, admission, session, tool,
    capture: () => capture,
    binding_id: connected.binding_id as string,
    readSaved: () => saved,
    close: () => { session.close(); unsubscribe(); admission.close() },
    current: () => useShowStore.getState().showV2Pilots[record.id],
    history: () => useShowStore.getState().showV2Histories[record.id],
  }
}

it('answers a duplicate begin key with the original operation and never opens a second candidate', async () => {
  const editor = await boundEditor()
  try {
    const begun = await editor.tool('begin_edit', { binding_id: editor.binding_id, intent: 'Rename', idempotency_key: 'begin' })
    expect(begun.code).toBe('begun')
    const repeat = await editor.tool('begin_edit', { binding_id: editor.binding_id, intent: 'Rename', idempotency_key: 'begin' })
    expect(repeat).toMatchObject({ code: 'begun', operation_id: begun.operation_id })
    const changed = await editor.tool('begin_edit', { binding_id: editor.binding_id, intent: 'A different intent', idempotency_key: 'begin' })
    expect(changed).toMatchObject({ code: 'identity_conflict', operation_id: begun.operation_id })
    expect(editor.write).not.toHaveBeenCalled()
  } finally { editor.close() }
}, 120_000)

it('refuses a commit whose base revision a manual edit superseded, with no partial adoption', async () => {
  const editor = await boundEditor()
  try {
    const begun = await editor.tool('begin_edit', { binding_id: editor.binding_id, intent: 'Rename', idempotency_key: 'begin' })
    const identity = { binding_id: editor.binding_id, operation_id: begun.operation_id as string }
    expect((await editor.tool('rename_show', { ...identity, idempotency_key: 'rename', name: 'Renamed by command' })).code).toBe('changed')
    // A manual edit lands between the capture and the commit.
    const manual = await admitShowV2PilotSetShowEnd({
      showId: editor.record.id, baseRevision: useShowStore.getState().showRevisions[editor.record.id] ?? 0,
      capture: editor.capture(), isCurrent: () => true, onAdopted: () => {},
      intent: { kind: 'set-show-end', showEndMs: 25_000 },
    })
    expect(manual.status).toBe('applied')
    editor.write.mockClear()
    expect((await editor.tool('commit_edit', { ...identity, idempotency_key: 'commit' })).code).toBe('outcome')
    const outcome = await editor.tool('get_outcome', identity)
    expect(outcome).toMatchObject({ code: 'outcome', receipt: { status: 'refused', reason: 'revision-conflict' } })
    expect(editor.write).not.toHaveBeenCalled()
    expect(editor.current().name).toBe(editor.record.name)
    expect(editor.readSaved().composition.showEndMs).toBe(25_000)
  } finally { editor.close() }
}, 120_000)

it('reports a failed save as a rolled-back receipt with the record and history restored', async () => {
  const editor = await boundEditor({ failSave: true })
  try {
    const before = structuredClone(editor.current())
    const begun = await editor.tool('begin_edit', { binding_id: editor.binding_id, intent: 'Rename', idempotency_key: 'begin' })
    const identity = { binding_id: editor.binding_id, operation_id: begun.operation_id as string }
    expect((await editor.tool('rename_show', { ...identity, idempotency_key: 'rename', name: 'Renamed by command' })).code).toBe('changed')
    expect((await editor.tool('commit_edit', { ...identity, idempotency_key: 'commit' })).code).toBe('outcome')
    await vi.waitFor(async () => {
      expect(await editor.tool('get_outcome', identity)).toMatchObject({ code: 'outcome', receipt: { status: 'applied', settlement: 'rolled-back' } })
    })
    expect(editor.current()).toEqual(before)
    expect(editor.history().past).toEqual([])
    expect(useShowStore.getState().showV2SaveFailure?.showId).toBe(editor.record.id)
  } finally { editor.close() }
}, 120_000)
